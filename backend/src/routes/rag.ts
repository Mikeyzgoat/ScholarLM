import { Hono } from "hono";
import { db } from "../db/database";
import type { DocumentRecord } from "../types";
import { answerDocumentQuestion } from "../services/rag";

const rag = new Hono();

rag.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object")
    return c.json(
      { error: { message: "Invalid JSON body", code: "INVALID_INPUT" } },
      400,
    );
  const input = body as { documentId?: unknown; question?: unknown };
  if (
    typeof input.documentId !== "string" ||
    !input.documentId.trim() ||
    typeof input.question !== "string" ||
    input.question.trim().length < 3 ||
    input.question.length > 2000
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
    return c.json(
      await answerDocumentQuestion({
        documentId: input.documentId,
        question: input.question.trim(),
        signal: c.req.raw.signal,
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
