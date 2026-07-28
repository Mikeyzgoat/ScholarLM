import { Hono } from "hono";
import { streamSpeech, synthesizeSpeech } from "../services/speech";
import {
  combineWavBytes,
  getCachedSpeech,
  normalizeSpeechText,
  storeCachedSpeech,
} from "../services/speechCache";
const speech = new Hono();
speech.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  const text =
    body && typeof body === "object" ? (body as { text?: unknown }).text : null;
  const sourceText =
    body && typeof body === "object"
      ? (body as { sourceText?: unknown }).sourceText
      : null;
  if (typeof text !== "string" || text.trim().length < 1 || text.length > 12000)
    return c.json(
      {
        error: {
          message: "Text must be 1–12000 characters",
          code: "INVALID_INPUT",
        },
      },
      400,
    );
  if (
    sourceText !== null &&
    sourceText !== undefined &&
    typeof sourceText !== "string"
  )
    return c.json(
      {
        error: {
          message: "Source text must be a string",
          code: "INVALID_INPUT",
        },
      },
      400,
    );
  const normalizedText = normalizeSpeechText(text);
  const cached = getCachedSpeech(normalizedText);
  if (cached && typeof sourceText === "string" && sourceText.trim())
    storeCachedSpeech(normalizedText, cached, sourceText);
  if (c.req.query("stream") === "1") {
    const encoder = new TextEncoder();
    if (cached)
      return new Response(
        `${JSON.stringify({
          text: normalizedText,
          audio: Buffer.from(cached).toString("base64"),
        })}\n`,
        {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "X-ScholarLM-TTS-Cache": "HIT",
          },
        },
      );
    const iterator = streamSpeech(normalizedText);
    const generatedChunks: Uint8Array[] = [];
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            if (generatedChunks.length)
              storeCachedSpeech(
                normalizedText,
                combineWavBytes(generatedChunks),
                typeof sourceText === "string" ? sourceText : undefined,
              );
            controller.close();
            return;
          }
          generatedChunks.push(next.value.audio);
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                text: next.value.text,
                audio: Buffer.from(next.value.audio).toString("base64"),
              })}\n`,
            ),
          );
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        await iterator.return(undefined);
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-ScholarLM-TTS-Cache": "MISS",
      },
    });
  }
  const bytes = cached ?? (await synthesizeSpeech(normalizedText));
  if (!cached)
    storeCachedSpeech(
      normalizedText,
      bytes,
      typeof sourceText === "string" ? sourceText : undefined,
    );
  const wav = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(wav, {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": cached
        ? "private, max-age=31536000, immutable"
        : "no-store",
      "X-ScholarLM-TTS-Cache": cached ? "HIT" : "MISS",
    },
  });
});
export default speech;
