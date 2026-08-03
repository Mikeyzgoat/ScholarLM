import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db } from "../db/database";
import type { DocumentRecord } from "../types";
import {
  answerDocumentGroupQuestion,
  answerDocumentQuestion,
} from "../services/rag";
import { activateDocumentVectorIndex } from "../services/vectorIndex";
import { storeExplanationRevision } from "../services/explanationHistory";
import { createHash } from "node:crypto";
import type { RagAnswer } from "../types";

const rag = new Hono();

function addAnswerToHistory(input: {
  result: RagAnswer;
  document: DocumentRecord;
  question: string;
  pageNumber?: number;
}): RagAnswer {
  const historyId = createHash("sha256")
    .update(
      [input.document.id, input.question.trim(), input.result.answer.trim()].join(
        "\u001f",
      ),
    )
    .digest("hex");
  const exists = db
    .query("SELECT 1 FROM explanation_history WHERE id=?")
    .get(historyId);
  if (!exists)
    storeExplanationRevision({
      selectedText: input.question,
      documentId: input.document.id,
      documentTitle: input.document.name,
      pageNumber: input.pageNumber ?? input.result.sources[0]?.pageNumber,
      mode: "explain",
      explanation: input.result.answer,
      intent: "general",
      inputKind: "text",
      requestId: historyId,
    });
  return { ...input.result, historyId };
}

rag.post("/activate", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  const documentId =
    body && typeof body === "object"
      ? (body as { documentId?: unknown }).documentId
      : null;
  if (typeof documentId !== "string" || !documentId.trim())
    return c.json(
      { error: { message: "Document ID is required", code: "INVALID_INPUT" } },
      400,
    );
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(documentId) as DocumentRecord | null;
  if (!document)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  if (document.status !== "ready")
    return c.json(
      {
        error: {
          message: "Document embeddings are not ready yet",
          code: "DOCUMENT_NOT_READY",
        },
      },
      409,
    );
  const chunkCount = activateDocumentVectorIndex(documentId);
  return c.json({ documentId, chunkCount, active: true });
});

rag.post("/group/:groupId", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    question?: unknown;
  } | null;
  if (
    !body ||
    typeof body.question !== "string" ||
    body.question.trim().length < 3 ||
    body.question.length > 2000
  )
    return c.json(
      {
        error: {
          message: "A 3–2000 character question is required",
          code: "INVALID_INPUT",
        },
      },
      400,
    );
  try {
    return c.json(
      await answerDocumentGroupQuestion({
        groupId: c.req.param("groupId"),
        question: body.question.trim(),
        signal: c.req.raw.signal,
      }),
    );
  } catch (error) {
    return c.json(
      {
        error: {
          message:
            error instanceof Error
              ? error.message
              : "PDF group question failed",
          code: "GROUP_RAG_FAILED",
        },
      },
      503,
    );
  }
});

rag.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object")
    return c.json(
      { error: { message: "Invalid JSON body", code: "INVALID_INPUT" } },
      400,
    );
  const input = body as {
    documentId?: unknown;
    question?: unknown;
    pageNumber?: unknown;
  };
  if (
    typeof input.documentId !== "string" ||
    !input.documentId.trim() ||
    typeof input.question !== "string" ||
    input.question.trim().length < 3 ||
    input.question.length > 2000 ||
    (input.pageNumber !== undefined &&
      (!Number.isInteger(input.pageNumber) || Number(input.pageNumber) < 1))
  )
    return c.json(
      {
        error: {
          message: "Document ID and a 3–2000 character question are required",
          code: "INVALID_INPUT",
        },
      },
      400,
    );

  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(input.documentId) as DocumentRecord | null;
  if (!document)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  if (document.status !== "ready")
    return c.json(
      {
        error: {
          message: "Document embeddings are not ready yet",
          code: "DOCUMENT_NOT_READY",
        },
      },
      409,
    );

  try {
    if (c.req.query("stream") === "1") {
      c.header("Content-Type", "application/x-ndjson; charset=utf-8");
      c.header("Cache-Control", "no-cache, no-transform");
      return stream(c, async (output) => {
        let writes = Promise.resolve();
        const send = (value: unknown) => {
          writes = writes.then(async () => {
            await output.write(`${JSON.stringify(value)}\n`);
          });
        };
        try {
          const result = addAnswerToHistory({
            result: await answerDocumentQuestion({
            documentId: input.documentId as string,
            question: (input.question as string).trim(),
            currentPage: input.pageNumber as number | undefined,
            signal: c.req.raw.signal,
            onToken: (token) => send({ type: "token", token }),
            }),
            document,
            question: (input.question as string).trim(),
            pageNumber: input.pageNumber as number | undefined,
          });
          send({ type: "done", result });
        } catch (error) {
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Document question failed",
          });
        }
        await writes;
      });
    }
    return c.json(
      addAnswerToHistory({
        result: await answerDocumentQuestion({
        documentId: input.documentId,
        question: input.question.trim(),
        currentPage: input.pageNumber as number | undefined,
        signal: c.req.raw.signal,
        }),
        document,
        question: input.question.trim(),
        pageNumber: input.pageNumber as number | undefined,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document question failed";
    return c.json(
      {
        error: {
          message,
          code: "RAG_FAILED",
        },
      },
      503,
    );
  }
});

export default rag;
