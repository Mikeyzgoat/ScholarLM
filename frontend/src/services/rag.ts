import { apiFetch, ApiError } from "../lib/api";
import { API_BASE_URL } from "../lib/constants";
import type { RagAnswer } from "../lib/types";

export function askDocument(input: {
  documentId: string;
  question: string;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}): Promise<RagAnswer> {
  const { onToken, signal, ...body } = input;
  return streamDocumentAnswer(body, onToken, signal);
}

async function streamDocumentAnswer(
  body: { documentId: string; question: string },
  onToken?: (token: string) => void,
  signal?: AbortSignal,
): Promise<RagAnswer> {
  const response = await fetch(`${API_BASE_URL}/qa?stream=1`, {
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
      payload?.error?.message ?? "Document question failed",
      response.status,
      payload?.error?.code,
    );
  }
  if (!response.body) throw new Error("Document answer stream was empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RagAnswer | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as {
      type?: string;
      token?: unknown;
      message?: unknown;
      result?: RagAnswer;
    };
    if (event.type === "token" && typeof event.token === "string")
      onToken?.(event.token);
    if (event.type === "done" && event.result) result = event.result;
    if (event.type === "error")
      throw new Error(
        typeof event.message === "string"
          ? event.message
          : "Document question failed",
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
  if (!result) throw new Error("Document answer stream ended unexpectedly");
  return result;
}

export function activateDocumentIndex(
  documentId: string,
): Promise<{ documentId: string; chunkCount: number; active: boolean }> {
  return apiFetch("/qa/activate", {
    method: "POST",
    body: JSON.stringify({ documentId }),
  });
}
