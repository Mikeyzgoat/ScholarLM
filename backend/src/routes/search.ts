import { Hono } from "hono";
import { db } from "../db/database";
import { semanticSearch } from "../services/semanticSearch";
const search = new Hono();
search.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object")
    return c.json(
      { error: { message: "Invalid JSON body", code: "INVALID_INPUT" } },
      400,
    );
  const b = body as { documentId?: unknown; query?: unknown; limit?: unknown };
  if (
    typeof b.documentId !== "string" ||
    !b.documentId.trim() ||
    typeof b.query !== "string" ||
    b.query.trim().length < 1 ||
    b.query.length > 1000 ||
    (b.limit !== undefined &&
      (!Number.isInteger(b.limit) ||
        Number(b.limit) < 1 ||
        Number(b.limit) > 20))
  )
    return c.json(
      {
        error: {
          message:
            "Document ID, a 1–1000 character query, and valid limit are required",
          code: "INVALID_INPUT",
        },
      },
      400,
    );
  if (!db.query("SELECT 1 FROM documents WHERE id=?").get(b.documentId))
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  return c.json({
    results: await semanticSearch({
      documentId: b.documentId,
      query: b.query,
      limit: b.limit as number | undefined,
    }),
  });
});
export default search;
