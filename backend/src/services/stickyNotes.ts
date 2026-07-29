import { createHash } from "node:crypto";
import { db } from "../db/database";
import { generateDocumentEmbeddings } from "./openRouter";
import { serializeEmbedding } from "../utils/vectors";

export interface ExtractedSticky {
  id: string;
  noteId: string;
  documentId: string;
  shapeId: string;
  label: string;
  content: string;
  kind: "explanation" | "note";
  explanationId?: string;
  pageNumber?: number;
}

function collectText(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    if (value.trim()) parts.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, parts));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim())
    parts.push(record.text.trim());
  Object.entries(record)
    .filter(([key]) => key !== "text")
    .forEach(([, item]) => {
      if (typeof item !== "string") collectText(item, parts);
    });
}

function shorten(value: string, fallback: string): string {
  const firstLine = value.split(/\r?\n/)[0]?.trim() || fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

function stickyHash(sticky: ExtractedSticky): string {
  return createHash("sha256")
    .update(
      [
        sticky.content,
        sticky.explanationId ?? "",
        sticky.pageNumber ?? "",
      ].join("\u001f"),
    )
    .digest("hex");
}

export function extractStickies(input: {
  noteId: string;
  documentId: string;
  snapshot: string | unknown;
}): ExtractedSticky[] {
  try {
    const snapshot =
      typeof input.snapshot === "string"
        ? (JSON.parse(input.snapshot) as unknown)
        : input.snapshot;
    const store =
      snapshot &&
      typeof snapshot === "object" &&
      "document" in snapshot &&
      snapshot.document &&
      typeof snapshot.document === "object" &&
      "store" in snapshot.document &&
      snapshot.document.store &&
      typeof snapshot.document.store === "object"
        ? (snapshot.document.store as Record<string, unknown>)
        : {};
    return Object.values(store).flatMap<ExtractedSticky>((record) => {
      if (!record || typeof record !== "object") return [];
      const shape = record as {
        id?: unknown;
        type?: unknown;
        props?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
      if (typeof shape.id !== "string") return [];
      if (shape.type === "scholar-explanation-sticky") {
        const question =
          typeof shape.props?.question === "string"
            ? shape.props.question.trim()
            : "";
        const explanation =
          typeof shape.props?.explanation === "string"
            ? shape.props.explanation.trim()
            : "";
        const content = [question, explanation].filter(Boolean).join("\n\n");
        if (!content) return [];
        const explanationId =
          typeof shape.props?.explanationId === "string" &&
          /^[a-f0-9]{64}$/.test(shape.props.explanationId)
            ? shape.props.explanationId
            : undefined;
        const rawPageNumber = shape.meta?.scholarLmPageNumber;
        const pageNumber =
          typeof rawPageNumber === "number" &&
          Number.isInteger(rawPageNumber) &&
          rawPageNumber > 0
            ? rawPageNumber
            : undefined;
        return [{
          id: `sticky:${input.noteId}:${shape.id}`,
          noteId: input.noteId,
          documentId: input.documentId,
          shapeId: shape.id,
          label: shorten(question, "Explanation"),
          content,
          kind: "explanation" as const,
          explanationId,
          pageNumber,
        }];
      }
      if (shape.type !== "note") return [];
      const parts: string[] = [];
      collectText(shape.props?.richText ?? shape.props?.text, parts);
      const content = [...new Set(parts)].join(" ").trim();
      if (!content) return [];
      return [{
        id: `sticky:${input.noteId}:${shape.id}`,
        noteId: input.noteId,
        documentId: input.documentId,
        shapeId: shape.id,
        label: shorten(content, "Sticky note"),
        content,
        kind: "note" as const,
      }];
    });
  } catch {
    return [];
  }
}

export async function indexNoteStickies(input: {
  noteId: string;
  documentId: string;
  snapshot: unknown;
}): Promise<void> {
  const stickies = extractStickies(input);
  const existing = db
    .query("SELECT id,content_hash contentHash FROM sticky_note_index WHERE note_id=?")
    .all(input.noteId) as Array<{ id: string; contentHash: string }>;
  const existingHashes = new Map(
    existing.map((item) => [item.id, item.contentHash]),
  );
  const changed = stickies.filter((sticky) => {
    return existingHashes.get(sticky.id) !== stickyHash(sticky);
  });
  const embeddings = changed.length
    ? await generateDocumentEmbeddings(changed.map((sticky) => sticky.content))
    : [];
  const currentIds = new Set(stickies.map((sticky) => sticky.id));
  db.transaction(() => {
    for (const item of existing)
      if (!currentIds.has(item.id))
        db.query("DELETE FROM sticky_note_index WHERE id=?").run(item.id);
    changed.forEach((sticky, index) => {
      const hash = stickyHash(sticky);
      db.query(
        `INSERT INTO sticky_note_index
         (id,note_id,document_id,shape_id,label,content,kind,content_hash,embedding,updated_at,explanation_id,page_number)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           label=excluded.label,content=excluded.content,kind=excluded.kind,
           content_hash=excluded.content_hash,embedding=excluded.embedding,
           updated_at=excluded.updated_at,
           explanation_id=excluded.explanation_id,
           page_number=excluded.page_number`,
      ).run(
        sticky.id,
        sticky.noteId,
        sticky.documentId,
        sticky.shapeId,
        sticky.label,
        sticky.content,
        sticky.kind,
        hash,
        serializeEmbedding(embeddings[index]),
        new Date().toISOString(),
        sticky.explanationId ?? null,
        sticky.pageNumber ?? null,
      );
    });
    stickies.forEach((sticky) => {
      if (!sticky.explanationId) return;
      db.query(
        `UPDATE explanation_history
         SET document_id=COALESCE(document_id,?),note_id=COALESCE(note_id,?)
         WHERE id=?`,
      ).run(sticky.documentId, sticky.noteId, sticky.explanationId);
    });
  })();
}

export async function ensureDocumentStickiesIndexed(
  documentId: string,
): Promise<void> {
  const notes = db
    .query("SELECT id,snapshot FROM note_pages WHERE document_id=?")
    .all(documentId) as Array<{ id: string; snapshot: string }>;
  for (const note of notes)
    await indexNoteStickies({
      noteId: note.id,
      documentId,
      snapshot: note.snapshot,
    });
}
