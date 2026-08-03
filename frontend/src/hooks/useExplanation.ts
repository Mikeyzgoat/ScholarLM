import { useCallback, useEffect, useRef, useState } from "react";
import { explainText } from "../services/explanation";
import type { ExplanationResponse } from "../lib/types";
import { cleanExplanation } from "../lib/plainExplanation";
export function useExplanation() {
  const [explanation, setExplanation] = useState(""),
    [isExplaining, setLoading] = useState(false),
    [pendingCount, setPendingCount] = useState(0),
    [error, setError] = useState<Error | null>(null);
  const controller = useRef<AbortController | null>(null),
    queue = useRef<Promise<void>>(Promise.resolve()),
    queueGeneration = useRef(0),
    mounted = useRef(true);
  const cancel = useCallback(() => {
    queueGeneration.current += 1;
    controller.current?.abort();
    controller.current = null;
    if (mounted.current) {
      setLoading(false);
      setPendingCount(0);
    }
  }, []);
  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        // Keep the active request alive so the server can persist its result
        // for history restoration. Only discard work that has not started.
        queueGeneration.current += 1;
      };
    },
    [],
  );
  const runExplanation = async (input: {
    selectedText?: string;
    selectedTexts?: string[];
    imageDataUrl?: string;
    graphRequested?: boolean;
    documentId?: string;
    noteId?: string;
    canvasId?: string;
    shapeId?: string;
    shapeIds?: string[];
    imageInputKind?: "handwriting" | "selection";
    documentTitle?: string;
    pageNumber?: number;
    mode?: "explain" | "regenerate" | "simplify";
    previousExplanation?: string;
  }): Promise<ExplanationResponse | null> => {
    const next = new AbortController();
    controller.current = next;
    setError(null);
    setLoading(true);
    try {
      let streamed = "";
      const value: ExplanationResponse = await explainText({
        ...input,
        signal: next.signal,
        onToken: (token) => {
          if (!mounted.current) return;
          streamed += token;
          setExplanation(streamed);
        },
      });
      const displayAnswer = value.answer ?? value.explanation;
      const answers = displayAnswer
        .split(/\s*<ANSWER_SPLIT>\s*/i)
        .map(cleanExplanation)
        .filter(Boolean);
      const cleaned = {
        ...value,
        explanation: answers.join("\n\n"),
        answer: answers.join("\n\n"),
        answers: answers.length > 1 ? answers : undefined,
      };
      if (mounted.current) setExplanation(cleaned.explanation);
      return cleaned;
    } catch (e) {
      const error = e instanceof Error ? e : new Error("Explanation failed");
      if (!next.signal.aborted && mounted.current) setError(error);
      throw error;
    } finally {
      if (controller.current === next) controller.current = null;
    }
  };
  return {
    explanation,
    explain: (input: {
      selectedText?: string;
      selectedTexts?: string[];
      imageDataUrl?: string;
      graphRequested?: boolean;
      documentId?: string;
      noteId?: string;
      canvasId?: string;
      shapeId?: string;
      shapeIds?: string[];
      imageInputKind?: "handwriting" | "selection";
      documentTitle?: string;
      pageNumber?: number;
      mode?: "explain" | "regenerate" | "simplify";
      previousExplanation?: string;
    }) => {
      setPendingCount((count) => count + 1);
      const generation = queueGeneration.current;
      const result = queue.current.then(() => {
        if (!mounted.current || generation !== queueGeneration.current)
          throw new DOMException("Explanation was cancelled", "AbortError");
        return runExplanation(input);
      });
      queue.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result.finally(() => {
        if (!mounted.current) return;
        setPendingCount((count) => {
          const next = Math.max(0, count - 1);
          setLoading(next > 0);
          return next;
        });
      });
    },
    cancel,
    clear: () => {
      setExplanation("");
      setError(null);
    },
    load: (value: string) => {
      setExplanation(value);
      setError(null);
    },
    isExplaining,
    pendingCount,
    error,
  };
}
