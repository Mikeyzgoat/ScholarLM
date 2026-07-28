import { apiFetch } from "../lib/api";
import type { GraphResponse } from "../lib/types";
export async function getDocumentGraph(
  documentId: string,
): Promise<GraphResponse> {
  return apiFetch(`/graph/${documentId}`);
}

export async function getGlobalGraph(): Promise<GraphResponse> {
  return apiFetch("/graph");
}
