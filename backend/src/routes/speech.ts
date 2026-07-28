import { Hono } from "hono";
import { streamSpeech, synthesizeSpeech } from "../services/speech";
const speech = new Hono();
speech.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  const text =
    body && typeof body === "object" ? (body as { text?: unknown }).text : null;
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
  if (c.req.query("stream") === "1") {
    const encoder = new TextEncoder();
    const iterator = streamSpeech(text.trim());
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            controller.close();
            return;
          }
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
      },
    });
  }
  const bytes = await synthesizeSpeech(text.trim());
  const wav = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(wav, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
});
export default speech;
