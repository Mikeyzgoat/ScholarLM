import { env } from "../env";
import type { KokoroTTS as KokoroModel } from "kokoro-js";

export interface SpeechAudio {
  audio: Uint8Array;
  mimeType: "audio/mpeg" | "audio/wav";
  provider: "fish-audio" | "kokoro";
}

let modelPromise: Promise<KokoroModel> | null = null;

function getKokoroModel(): Promise<KokoroModel> {
  if (!modelPromise)
    modelPromise = import("kokoro-js")
      .then(({ KokoroTTS }) =>
        KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
          dtype: "q8",
          device: "cpu",
        }),
      )
      .catch((error) => {
        modelPromise = null;
        throw error;
      });
  return modelPromise;
}

async function synthesizeWithFishAudio(text: string): Promise<SpeechAudio> {
  if (!env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is not configured");
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.FRONTEND_ORIGIN,
      "X-Title": "ScholarLM",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_SPEECH_MODEL,
      input: text,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new Error(
      `Fish Audio speech request failed with status ${response.status}: ${await response.text()}`,
    );
  return {
    audio: new Uint8Array(await response.arrayBuffer()),
    mimeType: "audio/mpeg",
    provider: "fish-audio",
  };
}

export async function synthesizeOpenRouterSpeech(
  text: string,
): Promise<SpeechAudio> {
  if (!text.trim()) throw new Error("Speech text is required");
  return synthesizeWithFishAudio(text);
}

async function synthesizeWithKokoro(text: string): Promise<SpeechAudio> {
  const audio = await (await getKokoroModel()).generate(text, {
    voice: "af_heart",
  });
  return {
    audio: new Uint8Array(audio.toWav()),
    mimeType: "audio/wav",
    provider: "kokoro",
  };
}

export async function synthesizeKokoroSpeech(
  text: string,
): Promise<SpeechAudio> {
  if (!text.trim()) throw new Error("Speech text is required");
  return synthesizeWithKokoro(text);
}

export async function warmSpeechModel(): Promise<void> {
  await getKokoroModel();
}

export async function synthesizeSpeech(text: string): Promise<SpeechAudio> {
  if (!text.trim()) throw new Error("Speech text is required");
  try {
    return await synthesizeWithFishAudio(text);
  } catch (error) {
    console.warn("[tts] Fish Audio failed; using Kokoro fallback", error);
    return synthesizeWithKokoro(text);
  }
}

export async function* streamSpeech(
  text: string,
): AsyncGenerator<{ text: string; audio: Uint8Array; mimeType: SpeechAudio["mimeType"]; provider: SpeechAudio["provider"] }> {
  if (!text.trim()) throw new Error("Speech text is required");
  try {
    const generated = await synthesizeWithFishAudio(text);
    yield { text, ...generated };
    return;
  } catch (error) {
    console.warn("[tts] Fish Audio streaming failed; using Kokoro fallback", error);
  }
  const model = await getKokoroModel();
  const { TextSplitterStream } = await import("kokoro-js");
  const splitter = new TextSplitterStream();
  splitter.push(text.trim());
  splitter.close();
  for await (const chunk of model.stream(splitter, { voice: "af_heart" })) {
    yield {
      text: chunk.text,
      audio: new Uint8Array(chunk.audio.toWav()),
      mimeType: "audio/wav",
      provider: "kokoro",
    };
  }
}
