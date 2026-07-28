import { useEffect, useState } from "react";
import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { AnimatePresence, motion } from "framer-motion";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
import type { MathPlot } from "../../lib/types";
import { findLatestGeneratedOutput } from "../../lib/generatedOutputs";
export function ExplainPanel({
  selectedText,
  selectedTexts,
  selectionImage,
  pageNumber,
  documentTitle,
  onPlotGenerated,
  onExplanationGenerated,
}: {
  selectedText: string;
  selectedTexts?: string[];
  selectionImage?: string;
  pageNumber: number | null;
  documentTitle: string;
  onPlotGenerated?: (plot: MathPlot, equation?: string) => void;
  onExplanationGenerated?: (input: {
    selectedText: string;
    explanation: string;
    mode: "explain" | "regenerate" | "simplify";
  }) => void;
}) {
  const state = useExplanation(),
    speech = useSpeech();
  const [graphRequested, setGraphRequested] = useState(false);
  async function explain(
    mode: "explain" | "regenerate" | "simplify" = "explain",
  ) {
    const value = await state.explain({
      selectedText,
      selectedTexts:
        selectedTexts && selectedTexts.length > 1 ? selectedTexts : undefined,
      imageDataUrl: selectionImage,
      graphRequested,
      documentTitle,
      pageNumber: pageNumber ?? undefined,
      mode,
      previousExplanation:
        mode === "explain" ? undefined : state.explanation || undefined,
    });
    if (value) {
      if (value.plot) onPlotGenerated?.(value.plot, value.recognizedEquation);
      onExplanationGenerated?.({
        selectedText,
        explanation: value.explanation,
        mode,
      });
      await speech.speak(value.explanation, selectedText);
    }
  }
  useEffect(() => {
    speech.stop();
    if (!selectedText.trim() && !selectionImage) {
      state.clear();
      return;
    }
    const existing = findLatestGeneratedOutput(
      selectedText,
      pageNumber ?? undefined,
    );
    if (existing) state.load(existing.text);
    else state.clear();
  }, [selectedText, selectionImage, pageNumber]);
  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.24, ease: "easeOut" } }}
      className="space-y-3 rounded-lg border bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Explanation</h2>
        {selectedText && (
          <label className="flex items-center gap-2 text-xs text-stone-400">
            <input
              type="checkbox"
              checked={graphRequested}
              onChange={(event) => setGraphRequested(event.target.checked)}
            />
            Add graph
          </label>
        )}
      </div>
      <AnimatePresence mode="popLayout">
        {selectedText && !state.explanation && (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <SelectionPopover
              selectedText={selectedText}
              onExplain={() => void explain("explain")}
              onDismiss={state.clear}
            />
            {selectedTexts && selectedTexts.length > 1 && (
              <p className="mt-2 text-xs text-orange-300">
                {selectedTexts.length} selected blocks will be answered
                separately in one request.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <ExplanationContent
        selectedText={selectedText}
        explanation={state.explanation}
        isLoading={state.isExplaining}
        error={state.error}
        activeWordIndex={speech.activeWordIndex}
      />
      {speech.error && (
        <p className="text-xs text-red-700">{speech.error.message}</p>
      )}
      {state.explanation && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={state.isExplaining}
              onClick={() => void explain("regenerate")}
              className="rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-200 hover:bg-orange-500/20 disabled:opacity-50"
            >
              {state.isExplaining ? "Working…" : "New explanation"}
            </button>
            <button
              type="button"
              disabled={state.isExplaining}
              onClick={() => void explain("simplify")}
              className="rounded-lg border border-purple-400/20 bg-purple-500/10 px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/20 disabled:opacity-50"
            >
              Simplify
            </button>
          </div>
          {selectedText && graphRequested && (
            <button
              type="button"
              className="w-full rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-300 hover:bg-orange-500/15"
              disabled={state.isExplaining}
              onClick={() => void explain("regenerate")}
            >
              {state.isExplaining ? "Generating graph…" : "Explain + add graph"}
            </button>
          )}
          <AudioControls
            isLoading={speech.isLoading}
            isPlaying={speech.isPlaying}
            isPaused={speech.isPaused}
            isReady={speech.isReady}
            usingFallback={speech.usingFallback}
            autoRead={speech.autoRead}
            onPause={speech.pause}
            onResume={speech.resume}
            onReplay={speech.replay}
            onStop={speech.stop}
            onAutoReadChange={speech.setAutoRead}
          />
        </>
      )}
    </motion.section>
  );
}
