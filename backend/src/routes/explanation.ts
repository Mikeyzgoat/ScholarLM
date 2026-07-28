import { Hono } from "hono";
import {
  explainCanvasSelection,
  explainSelectedText,
} from "../services/gemini";
const explanation = new Hono();
explanation.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object")
    return c.json(
      { error: { message: "Invalid JSON body", code: "INVALID_INPUT" } },
      400,
    );
  const b = body as {
    selectedText?: unknown;
    imageDataUrl?: unknown;
    documentTitle?: unknown;
    pageNumber?: unknown;
  };
  const hasText =
    typeof b.selectedText === "string" &&
    b.selectedText.trim().length >= 3 &&
    b.selectedText.length <= 12000;
  const hasImage =
    typeof b.imageDataUrl === "string" &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.imageDataUrl) &&
    b.imageDataUrl.length <= 6_000_000;
  if (
    (!hasText && !hasImage) ||
    (b.documentTitle !== undefined && typeof b.documentTitle !== "string") ||
    (b.pageNumber !== undefined &&
      (!Number.isInteger(b.pageNumber) || Number(b.pageNumber) < 1))
  )
    return c.json(
      {
        error: {
          message:
            "Provide selected text or a PNG image of the canvas selection",
          code: "INVALID_INPUT",
        },
      },
      400,
    );
  const context = {
    documentTitle: b.documentTitle as string | undefined,
    pageNumber: b.pageNumber as number | undefined,
  };
  if (hasImage)
    return c.json(
      await explainCanvasSelection({
        ...context,
        selectedText: hasText ? (b.selectedText as string).trim() : undefined,
        imageDataUrl: b.imageDataUrl as string,
      }),
    );
  return c.json({
    explanation: await explainSelectedText({
      ...context,
      selectedText: (b.selectedText as string).trim(),
    }),
  });
});
export default explanation;
