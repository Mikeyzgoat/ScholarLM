import {
  synthesizeKokoroSpeech,
  synthesizeOpenRouterSpeech,
  type SpeechAudio,
} from "./speech";
import {
  getExplanationSpeechVariant,
  getExplanationSpeechProviders,
  linkExplanationSpeech,
  storeCachedSpeech,
  storeExplanationSpeechVariant,
} from "./speechCache";

export async function prepareExplanationSpeechVariants(input: {
  explanationId: string;
  text: string;
  sourceText: string;
}): Promise<SpeechAudio> {
  const providers = getExplanationSpeechProviders(input.explanationId);
  const tasks = [
    providers.has("fish-audio")
      ? null
      : synthesizeOpenRouterSpeech(input.text),
    providers.has("kokoro") ? null : synthesizeKokoroSpeech(input.text),
  ].filter((task): task is Promise<SpeechAudio> => task !== null);
  const settled = await Promise.allSettled(tasks);
  settled.forEach((result) => {
    if (result.status === "fulfilled")
      storeExplanationSpeechVariant(input.explanationId, result.value);
  });
  const selected = getExplanationSpeechVariant(input.explanationId);
  if (!selected) {
    const reasons = settled.flatMap((result) =>
      result.status === "rejected" ? [String(result.reason)] : [],
    );
    throw new Error(reasons.join("; ") || "No audio provider returned audio");
  }
  storeCachedSpeech(input.text, selected.audio, input.sourceText);
  linkExplanationSpeech(input.explanationId, input.text);
  return selected;
}
