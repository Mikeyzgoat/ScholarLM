import { cleanExplanation } from "../../lib/plainExplanation";

export function HighlightedSpeechText({
  text,
  activeWordIndex,
}: {
  text: string;
  activeWordIndex: number;
}) {
  let wordIndex = -1;
  return cleanExplanation(text)
    .split(/(\s+)/)
    .map((part, index) => {
      if (!part || /^\s+$/.test(part)) return part;
      wordIndex += 1;
      return (
        <span
          key={`${index}:${part}`}
          className={
            wordIndex === activeWordIndex
              ? "rounded bg-orange-400/25 text-orange-100 transition-colors"
              : undefined
          }
        >
          {part}
        </span>
      );
    });
}

export function ExplanationContent({
  selectedText,
  explanation,
  isLoading,
  error,
  activeWordIndex = -1,
}: {
  selectedText: string;
  explanation: string;
  isLoading: boolean;
  error: Error | null;
  activeWordIndex?: number;
}) {
  if (isLoading && !explanation)
    return <p className="text-sm">Explaining selection…</p>;
  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (explanation)
    return (
      <div className="space-y-3 whitespace-pre-wrap text-sm leading-6">
        <p className="border-l-2 pl-3 text-xs text-stone-500">{selectedText}</p>
        <p>
          <HighlightedSpeechText
            text={explanation}
            activeWordIndex={activeWordIndex}
          />
          {isLoading && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-orange-400 align-middle" />
          )}
        </p>
      </div>
    );
  return (
    <p className="text-sm text-stone-500">
      Select text and request an explanation.
    </p>
  );
}
