import { API_BASE_URL } from "../lib/constants";
import { ApiError } from "../lib/api";
export async function generateSpeech(
  text: string,
  signal?: AbortSignal,
  sourceText?: string,
  explanationId?: string,
): Promise<Blob> {
  const r = await fetch(`${API_BASE_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sourceText, explanationId }),
    signal,
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    throw new ApiError(
      data?.error?.message ?? "Speech generation failed",
      r.status,
      data?.error?.code,
    );
  }
  return r.blob();
}

export async function streamSpeech(
  text: string,
  onChunk: (audio: Blob, text: string) => void,
  signal?: AbortSignal,
  sourceText?: string,
  explanationId?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/tts?stream=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sourceText, explanationId }),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      data?.error?.message ?? "Speech streaming failed",
      response.status,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { audio?: unknown; text?: unknown };
    if (typeof chunk.audio !== "string" || typeof chunk.text !== "string")
      throw new Error("Invalid Kokoro audio stream");
    const binary = atob(chunk.audio);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    onChunk(new Blob([bytes], { type: "audio/wav" }), chunk.text);
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
}
