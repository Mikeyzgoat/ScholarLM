import { db } from "../db/database";

function snapshotState(snapshot: unknown): {
  shapeIds: Set<string>;
  savedExplanationIds: Set<string>;
} {
  const shapeIds = new Set<string>();
  const savedExplanationIds = new Set<string>();
  if (!snapshot || typeof snapshot !== "object") {
    return { shapeIds, savedExplanationIds };
  }
  const document = (snapshot as { document?: unknown }).document;
  if (!document || typeof document !== "object")
    return { shapeIds, savedExplanationIds };
  const store = (document as { store?: unknown }).store;
  if (!store || typeof store !== "object")
    return { shapeIds, savedExplanationIds };
  Object.values(store as Record<string, unknown>).forEach((value) => {
    if (!value || typeof value !== "object") return;
    const record = value as {
      id?: unknown;
      typeName?: unknown;
      meta?: Record<string, unknown>;
      props?: Record<string, unknown>;
    };
    if (record.typeName !== "shape" || typeof record.id !== "string") return;
    shapeIds.add(record.id);
    const explanationId =
      typeof record.meta?.scholarLmExplanationId === "string"
        ? record.meta.scholarLmExplanationId
        : typeof record.props?.explanationId === "string"
          ? record.props.explanationId
          : "";
    if (explanationId) savedExplanationIds.add(explanationId);
  });
  return { shapeIds, savedExplanationIds };
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
  const { shapeIds, savedExplanationIds } = snapshotState(input.snapshot);
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
  const orphaned = new Set(
    sources
      .filter((source) => !shapeIds.has(source.shapeId))
      .map((source) => source.explanationId),
  );
  let removed = 0;
  orphaned.forEach((explanationId) => {
    if (savedExplanationIds.has(explanationId)) return;
    removed += db
      .query("DELETE FROM explanation_history WHERE id=?")
      .run(explanationId).changes;
  });
  return removed;
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
