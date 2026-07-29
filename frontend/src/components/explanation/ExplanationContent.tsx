import { useEffect, useRef } from "react";
import { cleanExplanation } from "../../lib/plainExplanation";

export function HighlightedSpeechText({
  text,
  activeWordIndex,
}: {
  text: string;
  activeWordIndex: number;
}) {
  const activeWord = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (activeWordIndex >= 0)
      activeWord.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
  }, [activeWordIndex]);
  let wordIndex = -1;
  return cleanExplanation(text)
    .split(/(\s+)/)
    .map((part, index) => {
      if (!part || /^\s+$/.test(part)) return part;
      wordIndex += 1;
      return (
        <span
          ref={wordIndex === activeWordIndex ? activeWord : undefined}
          key={`${index}:${part}`}
          className={
            wordIndex === activeWordIndex
              ? "rounded bg-orange-400/30 px-0.5 text-orange-100 shadow-[0_0_0_1px_rgba(251,146,60,0.18)] transition-colors"
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
