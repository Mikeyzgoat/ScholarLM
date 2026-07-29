import { apiFetch } from "../lib/api";

export interface StandaloneCanvasRecord {
  id: string;
  title: string;
  snapshot: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export async function saveStandaloneCanvas(input: {
  canvasId: string;
  title: string;
  snapshot: unknown;
  expectedRevision?: number;
}): Promise<StandaloneCanvasRecord> {
  const { canvasId, ...body } = input;
  return (
    await apiFetch<{ canvas: StandaloneCanvasRecord }>(
      `/canvases/${canvasId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    )
  ).canvas;
}

export async function deleteStandaloneCanvas(
  canvasId: string,
): Promise<void> {
  await apiFetch(`/canvases/${canvasId}`, { method: "DELETE" });
}
