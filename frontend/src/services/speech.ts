import { API_BASE_URL } from "../lib/constants";
import { ApiError } from "../lib/api";
export async function generateSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const r = await fetch(`${API_BASE_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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
