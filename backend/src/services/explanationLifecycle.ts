import { db } from "../db/database";

function snapshotState(snapshot: unknown): {
  shapeIds: Set<string>;
} {
  const shapeIds = new Set<string>();
  if (!snapshot || typeof snapshot !== "object") {
    return { shapeIds };
  }
  const document = (snapshot as { document?: unknown }).document;
  if (!document || typeof document !== "object")
    return { shapeIds };
  const store = (document as { store?: unknown }).store;
  if (!store || typeof store !== "object")
    return { shapeIds };
  Object.values(store as Record<string, unknown>).forEach((value) => {
    if (!value || typeof value !== "object") return;
    const record = value as {
      id?: unknown;
      typeName?: unknown;
    };
    if (record.typeName !== "shape" || typeof record.id !== "string") return;
    shapeIds.add(record.id);
  });
  return { shapeIds };
}

export function pruneOrphanedSelectionExplanations(input: {
  noteId?: string;
  canvasId?: string;
  snapshot: unknown;
}): number {
  const scope = input.noteId
    ? { column: "note_id", value: input.noteId }
    : input.canvasId
      ? { column: "canvas_id", value: input.canvasId }
      : null;
  if (!scope) return 0;
  const { shapeIds } = snapshotState(input.snapshot);
  const sources = db
    .query(
      `SELECT explanation_id explanationId,shape_id shapeId
       FROM explanation_sources
       WHERE ${scope.column}=?`,
    )
    .all(scope.value) as Array<{
    explanationId: string;
    shapeId: string;
  }>;
  return sources
    .filter((source) => !shapeIds.has(source.shapeId))
    .reduce(
      (removed, source) =>
        removed +
        db
          .query(
            "DELETE FROM explanation_sources WHERE explanation_id=? AND shape_id=?",
          )
          .run(source.explanationId, source.shapeId).changes,
      0,
    );
}

export function deleteScopedExplanations(input: {
  noteId?: string;
  canvasId?: string;
}): void {
  if (input.noteId)
    db.query("DELETE FROM explanation_history WHERE note_id=?").run(
      input.noteId,
    );
  if (input.canvasId)
    db.query("DELETE FROM explanation_history WHERE canvas_id=?").run(
      input.canvasId,
    );
}
