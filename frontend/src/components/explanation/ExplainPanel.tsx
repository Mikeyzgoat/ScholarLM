import { useEffect, useRef, useState } from "react";
import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { AnimatePresence, motion } from "framer-motion";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
import type { MathPlot } from "../../lib/types";
export function ExplainPanel({
  selectedText,
  selectionImage,
  pageNumber,
  documentTitle,
  liveSelections = true,
  requestKey = 0,
  onPlotGenerated,
  onExplanationGenerated,
}: {
  selectedText: string;
  selectionImage?: string;
  pageNumber: number | null;
  documentTitle: string;
  liveSelections?: boolean;
  requestKey?: number;
  onPlotGenerated?: (plot: MathPlot, equation?: string) => void;
  onExplanationGenerated?: (input: {
    selectedText: string;
    explanation: string;
  }) => void;
}) {
  const state = useExplanation(),
    speech = useSpeech();
  const [graphRequested, setGraphRequested] = useState(false);
  const lastExplained = useRef("");
  async function explain() {
    const value = await state.explain({
      selectedText,
      imageDataUrl: selectionImage,
      graphRequested,
      documentTitle,
      pageNumber: pageNumber ?? undefined,
    });
    if (value) {
      if (value.plot) onPlotGenerated?.(value.plot, value.recognizedEquation);
      onExplanationGenerated?.({
        selectedText,
        explanation: value.explanation,
      });
      await speech.speak(value.explanation);
    }
  }
  useEffect(() => {
    if (
      !liveSelections ||
      (selectedText.trim().length < 3 && !selectionImage) ||
      `${requestKey}:${selectedText}:${selectionImage?.length ?? 0}` ===
        lastExplained.current
    )
      return;
    const timer = setTimeout(() => {
      lastExplained.current = `${requestKey}:${selectedText}:${selectionImage?.length ?? 0}`;
      void explain();
    }, 350);
    return () => clearTimeout(timer);
  }, [
    selectedText,
    selectionImage,
    pageNumber,
    documentTitle,
    liveSelections,
    requestKey,
  ]);
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
              onExplain={() => void explain()}
              onDismiss={state.clear}
            />
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
          {selectedText && graphRequested && (
            <button
              type="button"
              className="w-full rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-300 hover:bg-orange-500/15"
              disabled={state.isExplaining}
              onClick={() => void explain()}
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
