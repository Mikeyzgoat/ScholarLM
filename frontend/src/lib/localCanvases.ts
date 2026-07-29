import { createRandomCanvasName } from "./randomName";

export interface LocalCanvasSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const indexKey = "scholarlm-local-canvases";
const legacyKey = "scholarlm-standalone-canvas";
const migrationKey = "scholarlm-local-canvases-migrated";
const snapshotKey = (id: string) => `scholarlm-local-canvas:${id}`;

function readIndex(): LocalCanvasSummary[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(indexKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is LocalCanvasSummary =>
            !!item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.createdAt === "string" &&
            typeof item.updatedAt === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeIndex(canvases: LocalCanvasSummary[]): void {
  localStorage.setItem(indexKey, JSON.stringify(canvases));
}

export function listLocalCanvases(): LocalCanvasSummary[] {
  const canvases = readIndex();
  if (localStorage.getItem(migrationKey) === "true") return canvases;
  const legacySnapshot = localStorage.getItem(legacyKey);
  localStorage.setItem(migrationKey, "true");
  if (!legacySnapshot || legacySnapshot === "{}") return canvases;
  const now = new Date().toISOString();
  const migrated: LocalCanvasSummary = {
    id: crypto.randomUUID(),
    title: "Recovered canvas",
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(snapshotKey(migrated.id), legacySnapshot);
  const next = [migrated, ...canvases];
  writeIndex(next);
  return next;
}

export function createLocalCanvas(): LocalCanvasSummary {
  const now = new Date().toISOString();
  const canvas: LocalCanvasSummary = {
    id: crypto.randomUUID(),
    title: createRandomCanvasName(),
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(snapshotKey(canvas.id), "{}");
  writeIndex([canvas, ...listLocalCanvases()]);
  return canvas;
}

export function updateLocalCanvasTitle(
  id: string,
  title: string,
): LocalCanvasSummary | null {
  const value = title.trim();
  if (!value) return null;
  let updated: LocalCanvasSummary | null = null;
  writeIndex(
    listLocalCanvases().map((canvas) => {
      if (canvas.id !== id) return canvas;
      updated = {
        ...canvas,
        title: value,
        updatedAt: new Date().toISOString(),
      };
      return updated;
    }),
  );
  return updated;
}

export function getLocalCanvas(id: string): LocalCanvasSummary | null {
  return listLocalCanvases().find((canvas) => canvas.id === id) ?? null;
}

export function loadLocalCanvasSnapshot(id: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(snapshotKey(id)) ?? "{}") as unknown;
  } catch {
    return {};
  }
}

export function saveLocalCanvasSnapshot(id: string, snapshot: unknown): void {
  localStorage.setItem(snapshotKey(id), JSON.stringify(snapshot));
  const now = new Date().toISOString();
  writeIndex(
    listLocalCanvases()
      .map((canvas) =>
        canvas.id === id ? { ...canvas, updatedAt: now } : canvas,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  );
}

export function removeLocalCanvas(id: string): void {
  localStorage.removeItem(snapshotKey(id));
  writeIndex(listLocalCanvases().filter((canvas) => canvas.id !== id));
}
