import type { KokoroTTS as KokoroModel } from "kokoro-js";

let modelPromise: Promise<KokoroModel> | null = null;

function getModel(): Promise<KokoroModel> {
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

export async function warmSpeechModel(): Promise<void> {
  await getModel();
}

export async function synthesizeSpeech(text: string): Promise<Uint8Array> {
  if (!text.trim()) throw new Error("Speech text is required");
  const audio = await (await getModel()).generate(text, { voice: "af_heart" });
  return new Uint8Array(audio.toWav());
}

export async function* streamSpeech(
  text: string,
): AsyncGenerator<{ text: string; audio: Uint8Array }> {
  if (!text.trim()) throw new Error("Speech text is required");
  const model = await getModel();
  const { TextSplitterStream } = await import("kokoro-js");
  const splitter = new TextSplitterStream();
  splitter.push(text.trim());
  splitter.close();
  for await (const chunk of model.stream(splitter, { voice: "af_heart" })) {
    yield {
      text: chunk.text,
      audio: new Uint8Array(chunk.audio.toWav()),
    };
  }
}
