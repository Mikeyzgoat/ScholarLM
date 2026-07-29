import { Hono } from "hono";
import { db } from "../db/database";
import {
  getGlobalKnowledgeGraph,
  getKnowledgeGraph,
} from "../services/knowledgeGraph";
import { getNote, updateNote } from "../services/notes";
import {
  getStandaloneCanvas,
  saveStandaloneCanvas,
} from "../services/standaloneCanvases";
import { indexNoteStickies } from "../services/stickyNotes";
const graph = new Hono();

function withoutShapes(snapshot: unknown, shapeIds: string[]): {
  snapshot: unknown;
  removed: number;
} {
  const copy = JSON.parse(JSON.stringify(snapshot)) as {
    document?: { store?: Record<string, unknown> };
  };
  const store = copy.document?.store;
  if (!store) return { snapshot: copy, removed: 0 };
  const removedIds = new Set(shapeIds);
  let changed = true;
  while (changed) {
    changed = false;
    Object.values(store).forEach((value) => {
      if (!value || typeof value !== "object") return;
      const record = value as { id?: unknown; parentId?: unknown };
      if (
        typeof record.id === "string" &&
        typeof record.parentId === "string" &&
        removedIds.has(record.parentId) &&
        !removedIds.has(record.id)
      ) {
        removedIds.add(record.id);
        changed = true;
      }
    });
  }
  let removed = 0;
  removedIds.forEach((id) => {
    if (id in store) {
      delete store[id];
      removed += 1;
    }
  });
  return { snapshot: copy, removed };
}

graph.get("/", (c) => c.json(getGlobalKnowledgeGraph()));
graph.delete("/concepts/:conceptId", (c) => {
  const removed = db
    .query("DELETE FROM concepts WHERE id=?")
    .run(c.req.param("conceptId")).changes;
  return removed
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Concept not found", code: "NOT_FOUND" } },
        404,
      );
});
graph.delete("/explanations/:explanationId", (c) => {
  const removed = db
    .query("DELETE FROM explanation_history WHERE id=?")
    .run(c.req.param("explanationId")).changes;
  return removed
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Explanation not found", code: "NOT_FOUND" } },
        404,
      );
});
graph.post("/nodes/delete", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    noteId?: unknown;
    canvasId?: unknown;
    shapeIds?: unknown;
  } | null;
  const shapeIds =
    body && Array.isArray(body.shapeIds)
      ? [
          ...new Set(
            body.shapeIds.filter(
              (value): value is string =>
                typeof value === "string" && Boolean(value.trim()),
            ),
          ),
        ]
      : [];
  if (
    !body ||
    shapeIds.length < 1 ||
    shapeIds.length > 500 ||
    (typeof body.noteId !== "string" &&
      typeof body.canvasId !== "string")
  )
    return c.json(
      { error: { message: "Invalid graph-node deletion", code: "INVALID_INPUT" } },
      400,
    );
  if (typeof body.noteId === "string") {
    const note = getNote(body.noteId);
    if (!note)
      return c.json(
        { error: { message: "Note not found", code: "NOT_FOUND" } },
        404,
      );
    const next = withoutShapes(note.snapshot, shapeIds);
    if (!next.removed)
      return c.json(
        { error: { message: "Canvas shape not found", code: "NOT_FOUND" } },
        404,
      );
    const updated = updateNote({
      noteId: note.id,
      snapshot: next.snapshot,
      expectedRevision: note.revision,
    });
    await indexNoteStickies({
      noteId: updated.id,
      documentId: updated.documentId,
      snapshot: updated.snapshot,
    });
    return c.json({ removed: next.removed });
  }
  const canvas = getStandaloneCanvas(String(body.canvasId));
  if (!canvas)
    return c.json(
      { error: { message: "Canvas not found", code: "NOT_FOUND" } },
      404,
    );
  const next = withoutShapes(canvas.snapshot, shapeIds);
  if (!next.removed)
    return c.json(
      { error: { message: "Canvas shape not found", code: "NOT_FOUND" } },
      404,
    );
  const updated = saveStandaloneCanvas({
    canvasId: canvas.id,
    title: canvas.title,
    snapshot: next.snapshot,
    expectedRevision: canvas.revision,
  });
  return c.json({ removed: next.removed, canvas: updated });
});
graph.get("/:documentId", (c) => {
  const id = c.req.param("documentId");
  if (!id)
    return c.json(
      { error: { message: "Document ID is required", code: "INVALID_ID" } },
      400,
    );
  if (!db.query("SELECT 1 FROM documents WHERE id=?").get(id))
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  return c.json(getKnowledgeGraph(id));
});
export default graph;
