import { db } from "../db/database";
import type { NotePageRecord } from "../types";
import { createId } from "../utils/ids";
interface NoteRow {
  id: string;
  document_id: string;
  title: string;
  metadata: string;
  snapshot: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
const map = (r: NoteRow): NotePageRecord => ({
  id: r.id,
  documentId: r.document_id,
  title: r.title,
  metadata: JSON.parse(r.metadata) as unknown,
  snapshot: JSON.parse(r.snapshot) as unknown,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export class NoteRevisionConflictError extends Error {}
export function createNote(input: {
  documentId: string;
  title: string;
  metadata: unknown;
  snapshot: unknown;
}): NotePageRecord {
  const id = createId(),
    now = new Date().toISOString();
  db.query("INSERT INTO note_pages VALUES (?,?,?,?,?,?,?,?)").run(
    id,
    input.documentId,
    input.title,
    JSON.stringify(input.metadata),
    JSON.stringify(input.snapshot),
    1,
    now,
    now,
  );
  return getNote(id)!;
}
export function listNotesForDocument(documentId: string): NotePageRecord[] {
  return (
    db
      .query(
        "SELECT * FROM note_pages WHERE document_id=? ORDER BY updated_at DESC",
      )
      .all(documentId) as NoteRow[]
  ).map(map);
}
export function getNote(noteId: string): NotePageRecord | null {
  const row = db
    .query("SELECT * FROM note_pages WHERE id=?")
    .get(noteId) as NoteRow | null;
  return row ? map(row) : null;
}
export function updateNote(input: {
  noteId: string;
  title?: string;
  metadata?: unknown;
  snapshot?: unknown;
  expectedRevision?: number;
}): NotePageRecord {
  const current = getNote(input.noteId);
  if (!current) throw new Error("Note not found");
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== current.revision
  )
    throw new NoteRevisionConflictError("Note was changed elsewhere");
  db.query(
    "UPDATE note_pages SET title=?,metadata=?,snapshot=?,revision=revision+1,updated_at=? WHERE id=?",
  ).run(
    input.title ?? current.title,
    JSON.stringify(input.metadata ?? current.metadata),
    JSON.stringify(input.snapshot ?? current.snapshot),
    new Date().toISOString(),
    input.noteId,
  );
  return getNote(input.noteId)!;
}
export function deleteNote(noteId: string): boolean {
  return db.query("DELETE FROM note_pages WHERE id=?").run(noteId).changes > 0;
}
