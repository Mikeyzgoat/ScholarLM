import { apiFetch } from "../lib/api";
import type { RagAnswer } from "../lib/types";

export function askDocument(input: {
  documentId: string;
  question: string;
}): Promise<RagAnswer> {
  return apiFetch<RagAnswer>("/qa", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function activateDocumentIndex(
  documentId: string,
): Promise<{ documentId: string; chunkCount: number; active: boolean }> {
  return apiFetch("/qa/activate", {
    method: "POST",
    body: JSON.stringify({ documentId }),
  });
}
