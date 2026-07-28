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
