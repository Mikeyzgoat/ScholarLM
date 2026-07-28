import { Hono } from "hono";
import { synthesizeSpeech } from "../services/speech";
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
