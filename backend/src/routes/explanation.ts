import { Hono } from "hono";
import { stream } from "hono/streaming";
import {
  explainCanvasSelection,
  explainSelectedText,
  generateCanvasVoiceExplanation,
  hasUsefulVoiceExplanation,
} from "../services/openRouter";
import {
  cancelExplanationRevision,
  findLatestExplanation,
  deleteFailedExplanation,
  failExplanationRevision,
  listExplanationHistory,
  storeExplanationRevision,
  type ExplanationMode,
} from "../services/explanationHistory";
import { createHash } from "node:crypto";
import { buildDeterministicMathGraph } from "../services/mathGraph";
import {
  beginOpenRouterRequest,
  cancelOpenRouterRequest,
  failOpenRouterRequest,
  finishOpenRouterRequest,
} from "../services/providerTelemetry";
import { db } from "../db/database";
const explanation = new Hono();
explanation.get("/history", (c) => {
  const noteId = c.req.query("noteId")?.trim();
  const canvasId = c.req.query("canvasId")?.trim();
  const documentId = c.req.query("documentId")?.trim();
  const scopes = [noteId, canvasId, documentId].filter(Boolean);
  if (scopes.length !== 1)
    return c.json(
      {
        error: {
          message: "Provide exactly one note, canvas, or document identifier",
          code: "INVALID_INPUT",
        },
      },
      400,
    );
  return c.json({
    explanations: listExplanationHistory({ noteId, canvasId, documentId }),
  });
});
explanation.delete("/history/:id", (c) =>
  deleteFailedExplanation(c.req.param("id"))
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Failed explanation not found", code: "NOT_FOUND" } },
        404,
      ),
);
explanation.post("/voice", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    answer?: unknown;
    recognizedEquation?: unknown;
    historyId?: unknown;
  } | null;
  if (
    !body ||
    typeof body.answer !== "string" ||
    !body.answer.trim() ||
    body.answer.length > 12000 ||
    (body.recognizedEquation !== undefined &&
      typeof body.recognizedEquation !== "string") ||
    (body.historyId !== undefined &&
      (typeof body.historyId !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.historyId)))
  )
    return c.json(
      { error: { message: "Invalid voice explanation request", code: "INVALID_INPUT" } },
      400,
    );
  try {
    const voiceExplanation = await generateCanvasVoiceExplanation({
      answer: body.answer.trim(),
      recognizedEquation:
        typeof body.recognizedEquation === "string"
          ? body.recognizedEquation.trim()
          : undefined,
      signal: c.req.raw.signal,
    });
    if (typeof body.historyId === "string")
      db.query(
        "UPDATE explanation_history SET voice_explanation=? WHERE id=?",
      ).run(voiceExplanation, body.historyId);
    return c.json({ voiceExplanation });
  } catch (error) {
    return c.json(
      {
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Voice explanation generation failed",
          code: "VOICE_EXPLANATION_FAILED",
        },
      },
      503,
    );
  }
});
explanation.post("/graph", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    equation?: unknown;
  } | null;
  if (
    !body ||
    typeof body.equation !== "string" ||
    body.equation.trim().length < 3 ||
    body.equation.length > 500
  )
    return c.json(
      { error: { message: "A valid equation is required", code: "INVALID_INPUT" } },
      400,
    );
  return c.json(buildDeterministicMathGraph(body.equation));
});
explanation.post("/lookup", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    selectedText?: unknown;
    imageDataUrl?: unknown;
    documentId?: unknown;
    canvasId?: unknown;
    shapeId?: unknown;
    documentTitle?: unknown;
    pageNumber?: unknown;
  } | null;
  if (
    !body ||
    typeof body.selectedText !== "string" ||
    !body.selectedText.trim() ||
    (body.imageDataUrl !== undefined &&
      (typeof body.imageDataUrl !== "string" ||
        body.imageDataUrl.length > 6_000_000 ||
        !/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(
          body.imageDataUrl,
        ))) ||
    (body.documentId !== undefined &&
      typeof body.documentId !== "string") ||
    (body.canvasId !== undefined && typeof body.canvasId !== "string") ||
    (body.shapeId !== undefined && typeof body.shapeId !== "string") ||
    (body.documentTitle !== undefined &&
      typeof body.documentTitle !== "string") ||
    (body.pageNumber !== undefined &&
      (!Number.isInteger(body.pageNumber) || Number(body.pageNumber) < 1))
  )
    return c.json(
      { error: { message: "Invalid explanation lookup", code: "INVALID_INPUT" } },
      400,
    );
  const imageFingerprint =
    typeof body.imageDataUrl === "string"
      ? createHash("sha256").update(body.imageDataUrl).digest("hex")
      : undefined;
  const cached = findLatestExplanation({
    selectedText: body.selectedText.trim(),
    documentId:
      typeof body.documentId === "string"
        ? body.documentId.trim()
        : undefined,
    canvasId:
      typeof body.canvasId === "string" ? body.canvasId.trim() : undefined,
    shapeId:
      typeof body.shapeId === "string" ? body.shapeId.trim() : undefined,
    imageFingerprint,
    documentTitle:
      typeof body.documentTitle === "string"
        ? body.documentTitle.trim()
        : undefined,
    pageNumber: body.pageNumber as number | undefined,
  });
  return c.json({
    explanation:
      cached &&
      !hasUsefulVoiceExplanation(cached.explanation, cached.voiceExplanation)
        ? { ...cached, voiceExplanation: undefined }
        : cached,
  });
});
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
    shapeIds?: unknown;
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
    (b.shapeIds !== undefined &&
      (!Array.isArray(b.shapeIds) ||
        b.shapeIds.length > 100 ||
        b.shapeIds.some(
          (value) => typeof value !== "string" || !value.trim(),
        ))) ||
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
  const shapeIds = Array.isArray(b.shapeIds)
    ? [...new Set(b.shapeIds.map((value) => String(value).trim()))]
    : undefined;
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
  const imageFingerprint = hasImage
    ? createHash("sha256")
        .update(b.imageDataUrl as string)
        .digest("hex")
    : undefined;
  if (mode === "explain" && b.graphRequested !== true) {
    const cached = findLatestExplanation({
      selectedText: historySelection,
      documentId,
      canvasId,
      shapeId,
      imageFingerprint,
      documentTitle: context.documentTitle,
      pageNumber: context.pageNumber,
    });
    if (cached)
      return c.json({
        ...cached,
        answer: cached.explanation,
        voiceExplanation: hasUsefulVoiceExplanation(
          cached.explanation,
          cached.voiceExplanation,
        )
          ? cached.voiceExplanation
          : undefined,
        cached: true,
      });
  }
  const requestId = beginOpenRouterRequest("explanation");
  const inputKind = hasImage
    ? b.imageInputKind === "selection"
      ? "selection"
      : "handwriting"
    : "text";
  storeExplanationRevision({
    selectedText: historySelection,
    documentId,
    noteId,
    canvasId,
    shapeId,
    shapeIds,
    imageFingerprint,
    documentTitle: context.documentTitle,
    pageNumber: context.pageNumber,
    mode,
    explanation: "",
    inputKind,
    requestId,
    status: "pending",
  });
  const complete = <
    T extends {
      answer?: string;
      explanation?: string;
      voiceExplanation?: string;
      intent?: "theory" | "math" | "problem-solving" | "general";
      recognizedEquation?: string;
    },
  >(
    generated: T,
    inputKind: "text" | "handwriting" | "selection",
    fallbackIntent = generated.intent,
  ) => {
    const answer = generated.answer ?? generated.explanation ?? "";
    const history = storeExplanationRevision({
      selectedText: historySelection,
      documentId,
      noteId,
      canvasId,
      shapeId,
      shapeIds,
      imageFingerprint,
      documentTitle: context.documentTitle,
      pageNumber: context.pageNumber,
      mode,
      explanation: answer,
      voiceExplanation: generated.voiceExplanation,
      intent: generated.intent ?? fallbackIntent,
      recognizedText: generated.recognizedEquation,
      inputKind,
      requestId,
    });
    finishOpenRouterRequest(requestId);
    return { ...generated, answer, explanation: answer, ...history };
  };
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
      if (b.graphRequested === true) {
        const verifiedGraph = buildDeterministicMathGraph(
          result.recognizedEquation || historySelection,
        );
        result.plot = verifiedGraph.plot;
        if (!verifiedGraph.plot)
          result.explanation = `${result.explanation}\n\nGraph not inserted: ${verifiedGraph.error ?? "unsupported equation"}`;
      }
      return c.json(
        complete(
          result,
          inputKind,
          "math",
        ),
      );
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
          });
          send({
            type: "done",
            result: complete(generated, "text"),
          });
          await writes;
        } catch (error) {
          if (c.req.raw.signal.aborted) {
            cancelOpenRouterRequest(requestId);
            cancelExplanationRevision(requestId);
            return;
          }
          failOpenRouterRequest(requestId, error);
          failExplanationRevision(requestId, error);
          send({
            type: "error",
            message:
              error instanceof Error ? error.message : "AI inference failed",
            historyId: requestId,
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
    return c.json(complete(generated, "text"));
  } catch (error) {
    if (c.req.raw.signal.aborted) {
      cancelOpenRouterRequest(requestId);
      cancelExplanationRevision(requestId);
      return new Response(null, { status: 499 });
    }
    failOpenRouterRequest(requestId, error);
    failExplanationRevision(requestId, error);
    const message =
      error instanceof Error ? error.message : "Local inference failed";
    const timedOut =
      (error instanceof DOMException && error.name === "TimeoutError") ||
      message.toLowerCase().includes("timed out");
    const providerUnavailable =
      message.toLowerCase().includes("provider returned error") ||
      message.toLowerCase().includes("connection was closed") ||
      message.toLowerCase().includes("unable to connect");
    return c.json(
      {
        error: {
          message: timedOut
            ? "The AI provider took too long to respond. Try a shorter selection."
            : providerUnavailable
              ? "The AI provider is temporarily unavailable. Your selection is preserved—please retry."
              : message,
          code: timedOut
            ? "AI_INFERENCE_TIMEOUT"
            : providerUnavailable
              ? "AI_PROVIDER_TEMPORARILY_UNAVAILABLE"
              : "AI_INFERENCE_UNAVAILABLE",
          historyId: requestId,
        },
      },
      503,
    );
  }
});
export default explanation;
