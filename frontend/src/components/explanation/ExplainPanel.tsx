import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
export function ExplainPanel({
  selectedText,
  pageNumber,
  documentTitle,
}: {
  selectedText: string;
  pageNumber: number | null;
  documentTitle: string;
}) {
  const state = useExplanation(),
    speech = useSpeech();
  async function explain() {
    const value = await state.explain({
      selectedText,
      documentTitle,
      pageNumber: pageNumber ?? undefined,
    });
    if (value) await speech.speak(value);
  }
  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <h2 className="font-semibold">Explanation</h2>
      {selectedText && !state.explanation && (
        <SelectionPopover
          selectedText={selectedText}
          onExplain={() => void explain()}
          onDismiss={state.clear}
        />
      )}
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
    </section>
  );
}
