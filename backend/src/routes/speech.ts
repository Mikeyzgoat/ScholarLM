import { Hono } from "hono";
import {
  streamSpeech,
  synthesizeSpeech,
  type SpeechAudio,
} from "../services/speech";
import {
  combineWavBytes,
  getCachedSpeech,
  getExplanationSpeech,
  linkExplanationSpeech,
  normalizeSpeechText,
  storeCachedSpeech,
} from "../services/speechCache";
import { backfillMissingExplanationAudio } from "../services/speechBackfill";
import { db } from "../db/database";

const speech = new Hono();

function cachedAudio(value: Uint8Array): SpeechAudio {
  const isWav =
    value.byteLength >= 12 &&
    String.fromCharCode(...value.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...value.slice(8, 12)) === "WAVE";
  return {
    audio: value,
    mimeType: isWav ? "audio/wav" : "audio/mpeg",
    provider: isWav ? "kokoro" : "fish-audio",
  };
}

speech.get("/explanation/:explanationId", async (c) => {
  const explanationId = c.req.param("explanationId");
  if (!/^[a-f0-9]{64}$/.test(explanationId))
    return c.json(
      { error: { message: "Invalid explanation identifier", code: "INVALID_INPUT" } },
      400,
    );
  let stored = getExplanationSpeech(explanationId);
  let cacheStatus = "HIT";
  if (!stored) {
    const explanation = db
      .query(
        "SELECT selected_text,explanation,voice_explanation FROM explanation_history WHERE id=?",
      )
      .get(explanationId) as {
        selected_text: string;
        explanation: string;
        voice_explanation: string | null;
      } | null;
    if (!explanation)
      return c.json(
        { error: { message: "Explanation was not found", code: "EXPLANATION_NOT_FOUND" } },
        404,
      );
    const speechText =
      explanation.voice_explanation?.trim() || explanation.explanation.trim();
    try {
      stored = getCachedSpeech(speechText);
      if (!stored) {
        const generated = await synthesizeSpeech(speechText);
        stored = generated.audio;
        storeCachedSpeech(speechText, stored, explanation.selected_text);
        cacheStatus = "MISS";
      }
      linkExplanationSpeech(explanationId, speechText);
    } catch (error) {
      console.error(
        `[tts] Could not prepare explanation audio ${explanationId}`,
        error,
      );
      return c.json(
        {
          error: {
            message: "Explanation audio could not be prepared",
            code: "AUDIO_GENERATION_FAILED",
          },
        },
        503,
      );
    }
  }
  const generated = cachedAudio(stored);
  return new Response(stored.slice().buffer as ArrayBuffer, {
    headers: {
      "Content-Type": generated.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-ScholarLM-TTS-Cache": cacheStatus,
    },
  });
});

speech.post("/backfill", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  const requested =
    body && typeof body === "object"
      ? (body as { limit?: unknown }).limit
      : undefined;
  if (
    requested !== undefined &&
    (!Number.isInteger(requested) || Number(requested) < 1)
  )
    return c.json(
      { error: { message: "Limit must be a positive integer", code: "INVALID_INPUT" } },
      400,
    );
  return c.json({
    backfill: await backfillMissingExplanationAudio(
      requested === undefined ? 10 : Number(requested),
    ),
  });
});

speech.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  const text =
    body && typeof body === "object" ? (body as { text?: unknown }).text : null;
  const sourceText =
    body && typeof body === "object"
      ? (body as { sourceText?: unknown }).sourceText
      : null;
  const explanationId =
    body && typeof body === "object"
      ? (body as { explanationId?: unknown }).explanationId
      : null;
  if (typeof text !== "string" || text.trim().length < 1 || text.length > 12000)
    return c.json(
      {
        error: {
          message: "Text must be 1-12000 characters",
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
      { error: { message: "Source text must be a string", code: "INVALID_INPUT" } },
      400,
    );
  if (
    explanationId != null &&
    (typeof explanationId !== "string" ||
      !/^[a-f0-9]{64}$/.test(explanationId))
  )
    return c.json(
      { error: { message: "Invalid explanation identifier", code: "INVALID_INPUT" } },
      400,
    );

  const normalizedText = normalizeSpeechText(text);
  const cached = getCachedSpeech(normalizedText);
  if (cached && typeof explanationId === "string")
    linkExplanationSpeech(explanationId, normalizedText);
  if (cached && typeof sourceText === "string" && sourceText.trim())
    storeCachedSpeech(normalizedText, cached, sourceText);

  if (c.req.query("stream") === "1") {
    const encoder = new TextEncoder();
    if (cached) {
      const generated = cachedAudio(cached);
      return new Response(
        `${JSON.stringify({
          text: normalizedText,
          audio: Buffer.from(generated.audio).toString("base64"),
          mimeType: generated.mimeType,
          provider: generated.provider,
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
    }
    const iterator = streamSpeech(normalizedText);
    const generatedChunks: Array<{
      audio: Uint8Array;
      mimeType: SpeechAudio["mimeType"];
    }> = [];
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            if (generatedChunks.length) {
              const first = generatedChunks[0];
              const combined =
                generatedChunks.length === 1
                  ? first.audio
                  : first.mimeType === "audio/wav" &&
                      generatedChunks.every((chunk) => chunk.mimeType === "audio/wav")
                    ? combineWavBytes(generatedChunks.map((chunk) => chunk.audio))
                    : first.audio;
              storeCachedSpeech(
                normalizedText,
                combined,
                typeof sourceText === "string" ? sourceText : undefined,
              );
            }
            if (generatedChunks.length && typeof explanationId === "string")
              linkExplanationSpeech(explanationId, normalizedText);
            controller.close();
            return;
          }
          generatedChunks.push(next.value);
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                text: next.value.text,
                audio: Buffer.from(next.value.audio).toString("base64"),
                mimeType: next.value.mimeType,
                provider: next.value.provider,
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

  const generated = cached ? cachedAudio(cached) : await synthesizeSpeech(normalizedText);
  if (!cached)
    storeCachedSpeech(
      normalizedText,
      generated.audio,
      typeof sourceText === "string" ? sourceText : undefined,
    );
  if (typeof explanationId === "string")
    linkExplanationSpeech(explanationId, normalizedText);
  const bytes = generated.audio.buffer.slice(
    generated.audio.byteOffset,
    generated.audio.byteOffset + generated.audio.byteLength,
  ) as ArrayBuffer;
  return new Response(bytes, {
    headers: {
      "Content-Type": generated.mimeType,
      "Cache-Control": cached
        ? "private, max-age=31536000, immutable"
        : "no-store",
      "X-ScholarLM-TTS-Provider": generated.provider,
      "X-ScholarLM-TTS-Cache": cached ? "HIT" : "MISS",
    },
  });
});

export default speech;
