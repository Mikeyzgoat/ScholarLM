import { apiFetch } from "../lib/api";
import { API_BASE_URL } from "../lib/constants";
import { ApiError } from "../lib/api";
import type { ExplanationResponse } from "../lib/types";
export async function explainText(input: {
  selectedText?: string;
  selectedTexts?: string[];
  imageDataUrl?: string;
  graphRequested?: boolean;
  documentId?: string;
  noteId?: string;
  canvasId?: string;
  shapeId?: string;
  imageInputKind?: "handwriting" | "selection";
  documentTitle?: string;
  pageNumber?: number;
  mode?: "explain" | "regenerate" | "simplify";
  previousExplanation?: string;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<ExplanationResponse> {
  const { signal, onToken, ...body } = input;
  const canStream = !body.imageDataUrl && body.graphRequested !== true;
  if (canStream) {
    const response = await fetch(`${API_BASE_URL}/explain?stream=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      throw new ApiError(
        payload?.error?.message ?? "Explanation failed",
        response.status,
        payload?.error?.code,
      );
    }
    if (!response.body) throw new Error("Explanation stream was empty");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: ExplanationResponse | null = null;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as {
        type?: string;
        token?: unknown;
        message?: unknown;
        result?: ExplanationResponse;
      };
      if (event.type === "token" && typeof event.token === "string")
        onToken?.(event.token);
      if (event.type === "done" && event.result) result = event.result;
      if (event.type === "error")
        throw new Error(
          typeof event.message === "string"
            ? event.message
            : "Explanation failed",
        );
    };
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
      if (done) break;
    }
    consume(buffer);
    if (!result) throw new Error("Explanation stream ended unexpectedly");
    return result;
  }
  return await apiFetch<ExplanationResponse>("/explain", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}
