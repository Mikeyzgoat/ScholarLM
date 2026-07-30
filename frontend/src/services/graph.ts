import { apiFetch } from "../lib/api";
import type { GraphGroup, GraphNode, GraphResponse } from "../lib/types";
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

export async function getLibraryGraphGroups(): Promise<GraphGroup[]> {
  return (
    await apiFetch<{ groups: GraphGroup[] }>("/graph/manual/library-groups")
  ).groups;
}

export async function getDocumentLibraryGroups(): Promise<GraphGroup[]> {
  return (
    await apiFetch<{ groups: GraphGroup[] }>("/graph/manual/document-groups")
  ).groups;
}

export type GraphScopeInput =
  | { scope: "global" }
  | { scope: "document"; documentId: string };

export async function createManualGraphEdge(
  scope: GraphScopeInput,
  input: { source: string; target: string; relationship: string },
): Promise<{ id: string }> {
  return apiFetch("/graph/manual/edges", {
    method: "POST",
    body: JSON.stringify({ ...scope, ...input }),
  });
}

export async function updateManualGraphEdge(
  edgeId: string,
  relationship: string,
): Promise<void> {
  await apiFetch(`/graph/manual/edges/${encodeURIComponent(edgeId)}`, {
    method: "PATCH",
    body: JSON.stringify({ relationship }),
  });
}

export async function deleteManualGraphEdge(edgeId: string): Promise<void> {
  await apiFetch(`/graph/manual/edges/${encodeURIComponent(edgeId)}`, {
    method: "DELETE",
  });
}

export async function createManualGraphGroup(
  scope: GraphScopeInput,
  input: { name: string; color: string; memberNodeIds: string[] },
): Promise<{ id: string }> {
  return apiFetch("/graph/manual/groups", {
    method: "POST",
    body: JSON.stringify({ ...scope, ...input }),
  });
}

export async function updateManualGraphGroup(
  groupId: string,
  input: { name?: string; color?: string; memberNodeIds?: string[] },
): Promise<void> {
  await apiFetch(`/graph/manual/groups/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteManualGraphGroup(groupId: string): Promise<void> {
  await apiFetch(`/graph/manual/groups/${encodeURIComponent(groupId)}`, {
    method: "DELETE",
  });
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
