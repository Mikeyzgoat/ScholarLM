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
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onExplain}
          className="flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-3 py-2 text-sm leading-5 text-white"
        >
          Explain selection
        </button>
        {onExplainWithGraph && (
          <button
            type="button"
            onClick={onExplainWithGraph}
            title="Use for graphable equations and functions; the plot is added to the canvas"
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-white/5 px-3 py-2 text-sm leading-5 text-teal-700 hover:bg-teal-50"
          >
            <ChartSpline size={15} />
            Explain + graph
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="col-span-2 min-h-9 rounded-lg text-sm text-stone-500 hover:bg-white/5 hover:text-stone-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
