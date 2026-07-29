import { createHash } from "node:crypto";
import { db } from "../db/database";

interface SpeechCacheRow {
  text_hash: string;
  text: string;
  audio: Uint8Array;
  byte_size: number;
}

export function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function speechHash(text: string): string {
  return createHash("sha256").update(normalizeSpeechText(text)).digest("hex");
}

export function getExplanationSpeech(explanationId: string): Uint8Array | null {
  const row = db
    .query(
      "SELECT s.audio FROM explanation_audio ea JOIN speech_cache s ON s.text_hash=ea.text_hash WHERE ea.explanation_id=?",
    )
    .get(explanationId) as { audio: Uint8Array } | null;
  if (!row) return null;
  db.query(
    "UPDATE explanation_audio SET last_accessed_at=? WHERE explanation_id=?",
  ).run(new Date().toISOString(), explanationId);
  return row.audio;
}

export function linkExplanationSpeech(
  explanationId: string,
  text: string,
): void {
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO explanation_audio(explanation_id,text_hash,created_at,last_accessed_at)
     VALUES(?,?,?,?)
     ON CONFLICT(explanation_id) DO UPDATE SET text_hash=excluded.text_hash,last_accessed_at=excluded.last_accessed_at`,
  ).run(explanationId, speechHash(text), now, now);
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
