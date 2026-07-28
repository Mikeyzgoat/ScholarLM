import { apiFetch } from "../lib/api";
import type { ExplanationResponse } from "../lib/types";
export async function explainText(input: {
  selectedText?: string;
  imageDataUrl?: string;
  graphRequested?: boolean;
  documentTitle?: string;
  pageNumber?: number;
  signal?: AbortSignal;
}): Promise<ExplanationResponse> {
  const { signal, ...body } = input;
  return await apiFetch<ExplanationResponse>("/explain", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
}
