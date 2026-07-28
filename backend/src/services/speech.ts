import { KokoroTTS } from "kokoro-js";
let modelPromise: Promise<KokoroTTS> | null = null;
function getModel(): Promise<KokoroTTS> {
  return (modelPromise ??= KokoroTTS.from_pretrained(
    "onnx-community/Kokoro-82M-v1.0-ONNX",
    { dtype: "q8", device: "cpu" },
  ));
}
export async function synthesizeSpeech(text: string): Promise<Uint8Array> {
  if (!text.trim()) throw new Error("Speech text is required");
  const audio = await (await getModel()).generate(text, { voice: "af_heart" });
  return new Uint8Array(audio.toWav());
}
