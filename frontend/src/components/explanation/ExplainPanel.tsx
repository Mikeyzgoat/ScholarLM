import { useEffect, useState } from "react";
import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { AnimatePresence, motion } from "framer-motion";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
import type { CanvasSelectionAnchor, MathPlot } from "../../lib/types";
import { findLatestGeneratedOutput } from "../../lib/generatedOutputs";
import { ChartSpline, FilePlus2, StickyNote } from "lucide-react";
export function ExplainPanel({
  selectedText,
  selectedTexts,
  existingExplanation,
  existingExplanationId,
  selectionAnchors,
  selectionImage,
  pageNumber,
  documentTitle,
  onPlotGenerated,
  onExplanationGenerated,
  onExplanationStickyRequested,
}: {
  selectedText: string;
  selectedTexts?: string[];
  existingExplanation?: string;
  existingExplanationId?: string;
  selectionAnchors?: CanvasSelectionAnchor[];
  selectionImage?: string;
  pageNumber: number | null;
  documentTitle: string;
  onPlotGenerated?: (plot: MathPlot, equation?: string) => void;
  onExplanationGenerated?: (input: {
    selectedText: string;
    explanation: string;
    mode: "explain" | "regenerate" | "simplify";
    answers?: string[];
    anchors?: CanvasSelectionAnchor[];
    explanationId?: string;
  }) => void;
  onExplanationStickyRequested?: NonNullable<
    typeof onExplanationGenerated
  >;
}) {
  const state = useExplanation(),
    speech = useSpeech();
  const [canvasInput, setCanvasInput] = useState<Parameters<
    NonNullable<typeof onExplanationGenerated>
  >[0]>();
  async function explain(
    mode: "explain" | "regenerate" | "simplify" = "explain",
    requestGraph = false,
  ) {
    const value = await state.explain({
      selectedText,
      selectedTexts:
        selectedTexts && selectedTexts.length > 1 ? selectedTexts : undefined,
      imageDataUrl: selectionImage,
      graphRequested: requestGraph,
      documentTitle,
      pageNumber: pageNumber ?? undefined,
      mode,
      previousExplanation:
        mode === "explain" ? undefined : state.explanation || undefined,
    });
    if (value) {
      if (value.plot) onPlotGenerated?.(value.plot, value.recognizedEquation);
      setCanvasInput({
        selectedText,
        explanation: value.explanation,
        mode,
        answers: value.answers,
        anchors: selectionAnchors,
        explanationId: value.historyId,
      });
      await speech.speak(value.explanation, selectedText, value.historyId);
    }
  }
  useEffect(() => {
    speech.stop();
    if (!selectedText.trim() && !selectionImage) {
      state.clear();
      setCanvasInput(undefined);
      return;
    }
    const existing =
      existingExplanation ||
      findLatestGeneratedOutput(selectedText, pageNumber ?? undefined)?.text;
    if (existing) {
      state.load(existing);
      setCanvasInput({
        selectedText,
        explanation: existing,
        mode: "explain",
        anchors: selectionAnchors,
        explanationId: existingExplanationId,
      });
    } else {
      state.clear();
      setCanvasInput(undefined);
    }
  }, [
    selectedText,
    selectionImage,
    pageNumber,
    existingExplanation,
    existingExplanationId,
    selectionAnchors,
  ]);
  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.24, ease: "easeOut" } }}
      className="space-y-3 rounded-lg border bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Explanation</h2>
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
              onExplainWithGraph={() => void explain("explain", true)}
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
              className="scholar-secondary-action rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed"
            >
              {state.isExplaining ? "Working…" : "New explanation"}
            </button>
            <button
              type="button"
              disabled={state.isExplaining}
              onClick={() => void explain("simplify")}
              className="scholar-purple-action rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed"
            >
              Simplify
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canvasInput || state.isExplaining}
              onClick={() => {
                if (canvasInput) onExplanationStickyRequested?.(canvasInput);
              }}
              className="scholar-primary-action flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium disabled:cursor-not-allowed"
            >
              <StickyNote size={15} />
              Add as sticky
            </button>
            <button
              type="button"
              disabled={!canvasInput || state.isExplaining}
              onClick={() => {
                if (canvasInput) onExplanationGenerated?.(canvasInput);
              }}
              className="scholar-secondary-action flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed"
            >
              <FilePlus2 size={15} />
              Add as text
            </button>
          </div>
          {selectedText && (
            <button
              type="button"
              className="scholar-secondary-action flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs"
              disabled={state.isExplaining}
              onClick={() => void explain("regenerate", true)}
            >
              <ChartSpline size={15} />
              {state.isExplaining ? "Generating graph…" : "Add graph to canvas"}
            </button>
          )}
          <AudioControls
            isLoading={speech.isLoading}
            isPlaying={speech.isPlaying}
            isPaused={speech.isPaused}
            isReady={speech.isReady}
            canLoad={Boolean(state.explanation)}
            usingFallback={speech.usingFallback}
            autoRead={speech.autoRead}
            onPause={speech.pause}
            onResume={() => {
              if (speech.isReady) speech.resume();
              else
                void speech.speak(
                  state.explanation,
                  selectedText,
                  existingExplanationId,
                );
            }}
            onReplay={speech.replay}
            onStop={speech.stop}
            onAutoReadChange={speech.setAutoRead}
          />
        </>
      )}
    </motion.section>
  );
}
