import { apiFetch } from "../lib/api";
import type { GraphNode, GraphResponse } from "../lib/types";
import { saveLocalCanvasSnapshot } from "../lib/localCanvases";
import { removeLocalNoteDraft } from "../lib/noteStorage";
export async function getDocumentGraph(
  documentId: string,
): Promise<GraphResponse> {
  return apiFetch(`/graph/${documentId}`);
}

export async function getGlobalGraph(): Promise<GraphResponse> {
  return apiFetch("/graph");
}

export async function deleteGraphLeafNode(node: GraphNode): Promise<void> {
  if (node.kind === "concept") {
    await apiFetch(`/graph/concepts/${node.id}`, { method: "DELETE" });
    return;
  }
  if (node.kind === "handwriting" && node.id.startsWith("handwriting:")) {
    await apiFetch(
      `/graph/explanations/${encodeURIComponent(node.id.slice(12))}`,
      { method: "DELETE" },
    );
    return;
  }
  const shapeIds = node.shapeIds ?? (node.shapeId ? [node.shapeId] : []);
  if (
    (node.kind === "sticky" ||
      node.id.startsWith("canvas-drawing:")) &&
    shapeIds.length
  ) {
    const result = await apiFetch<{
      canvas?: { id: string; snapshot: unknown };
    }>("/graph/nodes/delete", {
      method: "POST",
      body: JSON.stringify({
        noteId: node.noteId,
        canvasId: node.canvasId,
        shapeIds,
      }),
    });
    if (node.noteId) removeLocalNoteDraft(node.noteId);
    if (result.canvas)
      saveLocalCanvasSnapshot(result.canvas.id, result.canvas.snapshot);
    return;
  }
  throw new Error("This graph node must be deleted from its owning source");
}
