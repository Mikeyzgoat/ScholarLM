import { useCallback, useEffect, useRef, useState } from "react";
import { explainText } from "../services/explanation";
import type { ExplanationResponse } from "../lib/types";
import { cleanExplanation } from "../lib/plainExplanation";
export function useExplanation() {
  const [explanation, setExplanation] = useState(""),
    [isExplaining, setLoading] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    explanation,
    explain: async (input: {
      selectedText?: string;
      imageDataUrl?: string;
      graphRequested?: boolean;
      documentTitle?: string;
      pageNumber?: number;
    }) => {
      cancel();
      const id = ++generation.current;
      const next = new AbortController();
      controller.current = next;
      setError(null);
      setLoading(true);
      try {
        const value: ExplanationResponse = await explainText({
          ...input,
          signal: next.signal,
        });
        const cleaned = {
          ...value,
          explanation: cleanExplanation(value.explanation),
        };
        if (id === generation.current) setExplanation(cleaned.explanation);
        return id === generation.current ? cleaned : null;
      } catch (e) {
        if (!next.signal.aborted && id === generation.current)
          setError(e instanceof Error ? e : new Error("Explanation failed"));
        return null;
      } finally {
        if (id === generation.current) setLoading(false);
      }
    },
    cancel,
    clear: () => {
      cancel();
      setExplanation("");
      setError(null);
    },
    isExplaining,
    error,
  };
}
