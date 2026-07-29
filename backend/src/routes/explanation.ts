import { Hono } from "hono";
import { stream } from "hono/streaming";
import {
  explainCanvasSelection,
  explainSelectedText,
} from "../services/openRouter";
import {
  storeExplanationRevision,
  type ExplanationMode,
} from "../services/explanationHistory";
import {
  beginOpenRouterRequest,
  failOpenRouterRequest,
  finishOpenRouterRequest,
} from "../services/providerTelemetry";
import { db } from "../db/database";
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
    documentId?: unknown;
    noteId?: unknown;
    canvasId?: unknown;
    shapeId?: unknown;
    imageInputKind?: unknown;
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
    /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(
      b.imageDataUrl,
    ) &&
    b.imageDataUrl.length <= 6_000_000;
  if (
    (!hasText && !hasMultipleTexts && !hasImage) ||
    (b.selectedTexts !== undefined &&
      (!Array.isArray(b.selectedTexts) ||
        b.selectedTexts.length !== selectedTexts.length)) ||
    (b.graphRequested !== undefined &&
      typeof b.graphRequested !== "boolean") ||
    (b.documentId !== undefined &&
      (typeof b.documentId !== "string" || !b.documentId.trim())) ||
    (b.noteId !== undefined &&
      (typeof b.noteId !== "string" || !b.noteId.trim())) ||
    (b.canvasId !== undefined &&
      (typeof b.canvasId !== "string" || !b.canvasId.trim())) ||
    (b.shapeId !== undefined &&
      (typeof b.shapeId !== "string" || !b.shapeId.trim())) ||
    (b.imageInputKind !== undefined &&
      !["handwriting", "selection"].includes(String(b.imageInputKind))) ||
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
  const documentId =
    typeof b.documentId === "string" ? b.documentId.trim() : undefined;
  const noteId = typeof b.noteId === "string" ? b.noteId.trim() : undefined;
  const canvasId =
    typeof b.canvasId === "string" ? b.canvasId.trim() : undefined;
  const shapeId =
    typeof b.shapeId === "string" ? b.shapeId.trim() : undefined;
  const document = documentId
    ? (db
        .query("SELECT name FROM documents WHERE id=?")
        .get(documentId) as { name: string } | null)
    : null;
  if (documentId && !document)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  if (
    noteId &&
    !db
      .query(
        documentId
          ? "SELECT 1 FROM note_pages WHERE id=? AND document_id=?"
          : "SELECT 1 FROM note_pages WHERE id=?",
      )
      .get(...(documentId ? [noteId, documentId] : [noteId]))
  )
    return c.json(
      { error: { message: "Canvas note not found", code: "NOT_FOUND" } },
      404,
    );
  const context = {
    documentTitle:
      document?.name ?? (b.documentTitle as string | undefined),
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
  const requestId = beginOpenRouterRequest("explanation");
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
        documentId,
        noteId,
        canvasId,
        shapeId,
        documentTitle: context.documentTitle,
        pageNumber: context.pageNumber,
        mode,
        explanation: result.explanation,
        recognizedText: result.recognizedEquation,
        inputKind: hasImage
          ? b.imageInputKind === "selection"
            ? "selection"
            : "handwriting"
          : "text",
        requestId,
      });
      finishOpenRouterRequest(requestId);
      return c.json({ ...result, ...history });
    }
    if (c.req.query("stream") === "1") {
      c.header("Content-Type", "application/x-ndjson; charset=utf-8");
      c.header("Cache-Control", "no-cache, no-transform");
      c.header("X-Content-Type-Options", "nosniff");
      return stream(c, async (output) => {
        let writes = Promise.resolve();
        const send = (value: unknown) => {
          writes = writes.then(async () => {
            await output.write(`${JSON.stringify(value)}\n`);
          });
        };
        try {
          const generated = await explainSelectedText({
            ...context,
            selectedText: historySelection,
            selectedTexts: hasMultipleTexts ? selectedTexts : undefined,
            mode,
            previousExplanation,
            onToken: (token) => send({ type: "token", token }),
          });
          const history = storeExplanationRevision({
            selectedText: historySelection,
            documentId,
            noteId,
            canvasId,
            shapeId,
            documentTitle: context.documentTitle,
            pageNumber: context.pageNumber,
            mode,
            explanation: generated,
            inputKind: "text",
            requestId,
          });
          finishOpenRouterRequest(requestId);
          send({
            type: "done",
            result: { explanation: generated, ...history },
          });
          await writes;
        } catch (error) {
          failOpenRouterRequest(requestId, error);
          send({
            type: "error",
            message:
              error instanceof Error ? error.message : "AI inference failed",
          });
          await writes;
        }
      });
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
      documentId,
      noteId,
      canvasId,
      shapeId,
      documentTitle: context.documentTitle,
      pageNumber: context.pageNumber,
      mode,
      explanation: generated,
      inputKind: "text",
      requestId,
    });
    finishOpenRouterRequest(requestId);
    return c.json({ explanation: generated, ...history });
  } catch (error) {
    failOpenRouterRequest(requestId, error);
    const message =
      error instanceof Error ? error.message : "Local inference failed";
    const timedOut =
      (error instanceof DOMException && error.name === "TimeoutError") ||
      message.toLowerCase().includes("timed out");
    return c.json(
      {
        error: {
          message: timedOut
            ? "The AI provider took too long to respond. Try a shorter selection."
            : message,
          code: timedOut
            ? "AI_INFERENCE_TIMEOUT"
            : "AI_INFERENCE_UNAVAILABLE",
        },
      },
      503,
    );
  }
});
export default explanation;
