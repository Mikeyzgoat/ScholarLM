import { Hono } from "hono";
import {
  explainCanvasSelection,
  explainSelectedText,
} from "../services/localAi";
import {
  storeExplanationRevision,
  type ExplanationMode,
} from "../services/explanationHistory";
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
    selectedTexts?: unknown;
    imageDataUrl?: unknown;
    graphRequested?: unknown;
    documentTitle?: unknown;
    pageNumber?: unknown;
    mode?: unknown;
    previousExplanation?: unknown;
  };
  const hasText =
    typeof b.selectedText === "string" &&
    b.selectedText.trim().length >= 3 &&
    b.selectedText.length <= 12000;
  const selectedTexts = Array.isArray(b.selectedTexts)
    ? b.selectedTexts
        .filter(
          (value): value is string =>
            typeof value === "string" &&
            value.trim().length >= 3 &&
            value.length <= 4000,
        )
        .map((value) => value.trim())
        .slice(0, 10)
    : [];
  const hasMultipleTexts = selectedTexts.length > 0;
  const hasImage =
    typeof b.imageDataUrl === "string" &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.imageDataUrl) &&
    b.imageDataUrl.length <= 6_000_000;
  if (
    (!hasText && !hasMultipleTexts && !hasImage) ||
    (b.selectedTexts !== undefined &&
      (!Array.isArray(b.selectedTexts) ||
        b.selectedTexts.length !== selectedTexts.length)) ||
    (b.graphRequested !== undefined &&
      typeof b.graphRequested !== "boolean") ||
    (b.documentTitle !== undefined && typeof b.documentTitle !== "string") ||
    (b.pageNumber !== undefined &&
      (!Number.isInteger(b.pageNumber) || Number(b.pageNumber) < 1)) ||
    (b.mode !== undefined &&
      !["explain", "regenerate", "simplify"].includes(String(b.mode))) ||
    (b.previousExplanation !== undefined &&
      (typeof b.previousExplanation !== "string" ||
        b.previousExplanation.length > 12000))
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
    signal: c.req.raw.signal,
  };
  const mode = (b.mode ?? "explain") as ExplanationMode;
  const previousExplanation =
    typeof b.previousExplanation === "string"
      ? b.previousExplanation.trim()
      : undefined;
  const historySelection = hasMultipleTexts
    ? selectedTexts
        .map((value, index) => `Selection ${index + 1}: ${value}`)
        .join("\n\n")
    : hasText
      ? (b.selectedText as string).trim()
      : "Handwritten canvas selection";
  try {
    if (hasImage || b.graphRequested === true) {
      const result = await explainCanvasSelection({
        ...context,
        selectedText: historySelection,
        selectedTexts: hasMultipleTexts ? selectedTexts : undefined,
        imageDataUrl: hasImage ? (b.imageDataUrl as string) : undefined,
        graphRequested: b.graphRequested === true,
        mode,
        previousExplanation,
      });
      const history = storeExplanationRevision({
        selectedText: historySelection,
        documentTitle: context.documentTitle,
        pageNumber: context.pageNumber,
        mode,
        explanation: result.explanation,
      });
      return c.json({ ...result, ...history });
    }
    const generated = await explainSelectedText({
      ...context,
      selectedText: historySelection,
      selectedTexts: hasMultipleTexts ? selectedTexts : undefined,
      mode,
      previousExplanation,
    });
    const history = storeExplanationRevision({
      selectedText: historySelection,
      documentTitle: context.documentTitle,
      pageNumber: context.pageNumber,
      mode,
      explanation: generated,
    });
    return c.json({ explanation: generated, ...history });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local inference failed";
    const timedOut =
      (error instanceof DOMException && error.name === "TimeoutError") ||
      message.toLowerCase().includes("timed out");
    return c.json(
      {
        error: {
          message: timedOut
            ? "Ollama is running, but the local model took too long to respond. Try a shorter selection."
            : `${message} Make sure Ollama is running and try again.`,
          code: timedOut
            ? "LOCAL_INFERENCE_TIMEOUT"
            : "LOCAL_INFERENCE_UNAVAILABLE",
        },
      },
      503,
    );
  }
});
export default explanation;
