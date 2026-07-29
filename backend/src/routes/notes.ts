import { Hono, type Context } from "hono";
import { db } from "../db/database";
import {
  createNote,
  deleteNote,
  getNote,
  listNotesForDocument,
  NoteRevisionConflictError,
  updateNote,
} from "../services/notes";
import { indexNoteStickies } from "../services/stickyNotes";
const notes = new Hono();
const invalid = (c: Context, message: string) =>
  c.json({ error: { message, code: "INVALID_INPUT" } }, 400);
notes.post("/", async (c) => {
  const b = (await c.req.json<unknown>().catch(() => null)) as {
    documentId?: unknown;
    title?: unknown;
    metadata?: unknown;
    snapshot?: unknown;
  } | null;
  if (
    !b ||
    typeof b.documentId !== "string" ||
    !b.documentId.trim() ||
    typeof b.title !== "string" ||
    b.title.trim().length < 1 ||
    b.title.length > 200 ||
    b.metadata === undefined ||
    b.snapshot === undefined
  )
    return invalid(
      c,
      "Valid document, title, metadata, and snapshot are required",
    );
  if (!db.query("SELECT 1 FROM documents WHERE id=?").get(b.documentId))
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  const note = createNote({
    documentId: b.documentId,
    title: b.title.trim(),
    metadata: b.metadata,
    snapshot: b.snapshot,
  });
  let stickyIndexState: "ready" | "pending" = "ready";
  try {
    await indexNoteStickies({
      noteId: note.id,
      documentId: note.documentId,
      snapshot: note.snapshot,
    });
  } catch (error) {
    stickyIndexState = "pending";
    console.warn("[stickies] Initial indexing deferred", error);
  }
  return c.json({ note, stickyIndexState }, 201);
});
notes.get("/document/:documentId", (c) => {
  const id = c.req.param("documentId");
  return id
    ? c.json({ notes: listNotesForDocument(id) })
    : invalid(c, "Document ID is required");
});
notes.get("/:noteId", (c) => {
  const n = getNote(c.req.param("noteId"));
  return n
    ? c.json({ note: n })
    : c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
});
notes.put("/:noteId", async (c) => {
  const id = c.req.param("noteId"),
    b = (await c.req.json<unknown>().catch(() => null)) as {
      title?: unknown;
      metadata?: unknown;
      snapshot?: unknown;
      expectedRevision?: unknown;
    } | null;
  if (
    !id ||
    !b ||
    (b.title !== undefined &&
      (typeof b.title !== "string" ||
        !b.title.trim() ||
        b.title.length > 200)) ||
    (b.expectedRevision !== undefined && !Number.isInteger(b.expectedRevision))
  )
    return invalid(c, "Invalid note update");
  if (!getNote(id))
    return c.json(
      { error: { message: "Note not found", code: "NOT_FOUND" } },
      404,
    );
  try {
    const note = updateNote({
      noteId: id,
      title: b.title as string | undefined,
      metadata: b.metadata,
      snapshot: b.snapshot,
      expectedRevision: b.expectedRevision as number | undefined,
    });
    let stickyIndexState: "ready" | "pending" = "ready";
    if (b.snapshot !== undefined)
      try {
        await indexNoteStickies({
          noteId: note.id,
          documentId: note.documentId,
          snapshot: note.snapshot,
        });
      } catch (error) {
        stickyIndexState = "pending";
        console.warn("[stickies] Reindexing deferred", error);
      }
    return c.json({
      note,
      stickyIndexState,
    });
  } catch (e) {
    if (e instanceof NoteRevisionConflictError)
      return c.json(
        { error: { message: e.message, code: "REVISION_CONFLICT" } },
        409,
      );
    throw e;
  }
});
notes.delete("/:noteId", (c) =>
  deleteNote(c.req.param("noteId"))
    ? c.body(null, 204)
    : c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404),
);
export default notes;
