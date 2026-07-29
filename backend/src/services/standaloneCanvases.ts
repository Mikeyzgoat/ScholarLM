import { db } from "../db/database";

interface StandaloneCanvasRow {
  id: string;
  title: string;
  snapshot: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface StandaloneCanvasRecord {
  id: string;
  title: string;
  snapshot: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

function mapCanvas(row: StandaloneCanvasRow): StandaloneCanvasRecord {
  return {
    id: row.id,
    title: row.title,
    snapshot: JSON.parse(row.snapshot) as unknown,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CanvasRevisionConflictError extends Error {}

export function getStandaloneCanvas(
  canvasId: string,
): StandaloneCanvasRecord | null {
  const row = db
    .query("SELECT * FROM standalone_canvases WHERE id=?")
    .get(canvasId) as StandaloneCanvasRow | null;
  return row ? mapCanvas(row) : null;
}

export function listStandaloneCanvases(): StandaloneCanvasRecord[] {
  return (
    db
      .query("SELECT * FROM standalone_canvases ORDER BY updated_at DESC")
      .all() as StandaloneCanvasRow[]
  ).map(mapCanvas);
}

export function saveStandaloneCanvas(input: {
  canvasId: string;
  title: string;
  snapshot: unknown;
  expectedRevision?: number;
}): StandaloneCanvasRecord {
  const current = getStandaloneCanvas(input.canvasId);
  if (
    current &&
    input.expectedRevision !== undefined &&
    input.expectedRevision !== current.revision
  )
    throw new CanvasRevisionConflictError("Canvas was changed elsewhere");
  const now = new Date().toISOString();
  if (!current)
    db.query(
      `INSERT INTO standalone_canvases
       (id,title,snapshot,revision,created_at,updated_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      input.canvasId,
      input.title,
      JSON.stringify(input.snapshot),
      1,
      now,
      now,
    );
  else
    db.query(
      `UPDATE standalone_canvases
       SET title=?,snapshot=?,revision=revision+1,updated_at=?
       WHERE id=?`,
    ).run(
      input.title,
      JSON.stringify(input.snapshot),
      now,
      input.canvasId,
    );
  return getStandaloneCanvas(input.canvasId)!;
}

export function deleteStandaloneCanvas(canvasId: string): boolean {
  return (
    db.query("DELETE FROM standalone_canvases WHERE id=?").run(canvasId)
      .changes > 0
  );
}
