import { ChartSpline } from "lucide-react";

export function SelectionPopover({
  selectedText,
  onExplain,
  onExplainWithGraph,
  onDismiss,
}: {
  selectedText: string;
  onExplain: () => void;
  onExplainWithGraph?: () => void;
  onDismiss: () => void;
}) {
  if (!selectedText) return null;
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
      <p className="line-clamp-2 text-xs text-stone-600">{selectedText}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onExplain}
          className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white"
        >
          Explain selection
        </button>
        {onExplainWithGraph && (
          <button
            type="button"
            onClick={onExplainWithGraph}
            className="flex items-center gap-1.5 rounded border border-teal-200 bg-white/5 px-3 py-1.5 text-sm text-teal-700 hover:bg-teal-50"
          >
            <ChartSpline size={15} />
            Explain + graph
          </button>
        )}
        <button onClick={onDismiss} className="text-sm">
          Dismiss
        </button>
      </div>
    </div>
  );
}
