import { useEffect, useRef } from "react";
import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { AnimatePresence, motion } from "framer-motion";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
export function ExplainPanel({
  selectedText,
  pageNumber,
  documentTitle,
  liveSelections = true,
}: {
  selectedText: string;
  pageNumber: number | null;
  documentTitle: string;
  liveSelections?: boolean;
}) {
  const state = useExplanation(),
    speech = useSpeech();
  const lastExplained = useRef("");
  async function explain() {
    const value = await state.explain({
      selectedText,
      documentTitle,
      pageNumber: pageNumber ?? undefined,
    });
    if (value) await speech.speak(value);
  }
  useEffect(() => {
    if (
      !liveSelections ||
      selectedText.trim().length < 3 ||
      selectedText === lastExplained.current
    )
      return;
    const timer = setTimeout(() => {
      lastExplained.current = selectedText;
      void explain();
    }, 350);
    return () => clearTimeout(timer);
  }, [selectedText, pageNumber, documentTitle, liveSelections]);
  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.24, ease: "easeOut" } }}
      className="space-y-3 rounded-lg border bg-white p-4"
    >
      <h2 className="font-semibold">Explanation</h2>
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
      />
      {speech.error && (
        <p className="text-xs text-red-700">{speech.error.message}</p>
      )}
      {state.explanation && (
        <AudioControls
          isLoading={speech.isLoading}
          isPlaying={speech.isPlaying}
          isPaused={speech.isPaused}
          autoRead={speech.autoRead}
          onPause={speech.pause}
          onResume={speech.resume}
          onReplay={speech.replay}
          onStop={speech.stop}
          onAutoReadChange={speech.setAutoRead}
        />
      )}
    </motion.section>
  );
}
