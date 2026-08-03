import { createHash } from "node:crypto";
import { db } from "../db/database";
import type { SpeechAudio } from "./speech";

interface SpeechCacheRow {
  text_hash: string;
  text: string;
  audio: Uint8Array;
  byte_size: number;
}

export function normalizeSpeechText(text: string): string {
  return text
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/≤/g, " less than or equal to ")
    .replace(/≥/g, " greater than or equal to ")
    .replace(/≠/g, " not equal to ")
    .replace(/±/g, " plus or minus ")
    .replace(/√/g, " square root of ")
    .replace(/∑/g, " sum of ")
    .replace(/∞/g, " infinity ")
    .replace(/π/g, " pi ")
    .replace(/θ/g, " theta ")
    .replace(/α/g, " alpha ")
    .replace(/β/g, " beta ")
    .replace(/²/g, " squared ")
    .replace(/³/g, " cubed ")
    .replace(/⁻([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, " to the power of negative $1 ")
    .replace(/([⁰¹⁴⁵⁶⁷⁸⁹]+)/g, " to the power of $1 ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (character) =>
      ({ "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" })[character] ?? character,
    )
    .replace(/=/g, " equals ")
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function speechHash(text: string): string {
  return createHash("sha256").update(normalizeSpeechText(text)).digest("hex");
}

export function getExplanationSpeechVariant(
  explanationId: string,
): SpeechAudio | null {
  const row = db
    .query(
      `SELECT audio,mime_type mimeType,provider
       FROM explanation_audio_variants
       WHERE explanation_id=?
       ORDER BY CASE provider WHEN 'fish-audio' THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .get(explanationId) as SpeechAudio | null;
  if (!row) return null;
  db.query(
    "UPDATE explanation_audio_variants SET last_accessed_at=? WHERE explanation_id=? AND provider=?",
  ).run(new Date().toISOString(), explanationId, row.provider);
  return row;
}

export function getExplanationSpeechProviders(explanationId: string): Set<string> {
  return new Set(
    (
      db
        .query("SELECT provider FROM explanation_audio_variants WHERE explanation_id=?")
        .all(explanationId) as Array<{ provider: string }>
    ).map((row) => row.provider),
  );
}

export function storeExplanationSpeechVariant(
  explanationId: string,
  generated: SpeechAudio,
): void {
  if (!generated.audio.byteLength) return;
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO explanation_audio_variants
      (explanation_id,provider,audio,mime_type,created_at,last_accessed_at)
     SELECT ?,?,?,?,?,?
     WHERE EXISTS (SELECT 1 FROM explanation_history WHERE id=? AND status='complete')
     ON CONFLICT(explanation_id,provider) DO UPDATE SET
       audio=excluded.audio,mime_type=excluded.mime_type,
       last_accessed_at=excluded.last_accessed_at`,
  ).run(
    explanationId,
    generated.provider,
    generated.audio,
    generated.mimeType,
    now,
    now,
    explanationId,
  );
}

export function linkExplanationSpeech(
  explanationId: string,
  text: string,
): void {
  const now = new Date().toISOString();
  const textHash = speechHash(text);
  db.query(
    `INSERT INTO explanation_audio(explanation_id,text_hash,created_at,last_accessed_at)
     SELECT ?,?,?,?
     WHERE EXISTS (SELECT 1 FROM explanation_history WHERE id=?)
       AND EXISTS (SELECT 1 FROM speech_cache WHERE text_hash=?)
     ON CONFLICT(explanation_id) DO UPDATE SET text_hash=excluded.text_hash,last_accessed_at=excluded.last_accessed_at`,
  ).run(explanationId, textHash, now, now, explanationId, textHash);
}

function sourceHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function getCachedSpeech(text: string): Uint8Array | null {
  const hash = speechHash(text);
  const row = db
    .query(
      "SELECT text_hash,text,audio,byte_size FROM speech_cache WHERE text_hash=?",
    )
    .get(hash) as SpeechCacheRow | null;
  if (!row) return null;
  db.query(
    "UPDATE speech_cache SET hit_count=hit_count+1,last_accessed_at=? WHERE text_hash=?",
  ).run(new Date().toISOString(), hash);
  return row.audio;
}

export function storeCachedSpeech(
  text: string,
  audio: Uint8Array,
  sourceText?: string,
): void {
  if (!audio.byteLength) return;
  const normalized = normalizeSpeechText(text);
  const hash = speechHash(normalized);
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO speech_cache
      (text_hash,source_text,text,audio,byte_size,hit_count,created_at,last_accessed_at)
     VALUES (?,?,?,?,?,0,?,?)
     ON CONFLICT(text_hash) DO UPDATE SET
      source_text=COALESCE(excluded.source_text,speech_cache.source_text),
      text=excluded.text,
      audio=excluded.audio,
      byte_size=excluded.byte_size,
      last_accessed_at=excluded.last_accessed_at`,
  ).run(
    hash,
    sourceText?.trim() || null,
    normalized,
    audio,
    audio.byteLength,
    now,
    now,
  );
  if (sourceText?.trim())
    db.query(
      `INSERT INTO generated_output_audio
        (source_hash,text_hash,source_text,output_text,created_at,last_accessed_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(source_hash,text_hash) DO UPDATE SET
        source_text=excluded.source_text,
        output_text=excluded.output_text,
        last_accessed_at=excluded.last_accessed_at`,
    ).run(
      sourceHash(sourceText),
      hash,
      sourceText.trim(),
      normalized,
      now,
      now,
    );
}

interface WavPart {
  bytes: Uint8Array;
  dataOffset: number;
  dataSize: number;
  sizeFieldOffset: number;
}

function parseWav(bytes: Uint8Array): WavPart {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const label = (offset: number) =>
    String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
  if (bytes.byteLength < 44 || label(0) !== "RIFF" || label(8) !== "WAVE")
    throw new Error("Invalid WAV chunk");
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, true);
    if (label(offset) === "data")
      return {
        bytes,
        dataOffset: offset + 8,
        dataSize: Math.min(size, bytes.byteLength - offset - 8),
        sizeFieldOffset: offset + 4,
      };
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk not found");
}

export function combineWavBytes(chunks: Uint8Array[]): Uint8Array {
  if (!chunks.length) throw new Error("No WAV chunks to combine");
  if (chunks.length === 1) return chunks[0];
  const parts = chunks.map(parseWav);
  const first = parts[0];
  const header = first.bytes.slice(0, first.dataOffset);
  const dataSize = parts.reduce((total, part) => total + part.dataSize, 0);
  const output = new Uint8Array(header.byteLength + dataSize);
  output.set(header);
  let offset = header.byteLength;
  for (const part of parts) {
    output.set(
      part.bytes.subarray(part.dataOffset, part.dataOffset + part.dataSize),
      offset,
    );
    offset += part.dataSize;
  }
  const view = new DataView(output.buffer);
  view.setUint32(4, output.byteLength - 8, true);
  view.setUint32(first.sizeFieldOffset, dataSize, true);
  return output;
}
