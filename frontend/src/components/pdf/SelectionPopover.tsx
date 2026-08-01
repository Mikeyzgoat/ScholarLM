export function SelectionPopover({
  selectedText,
  onExplain,
  onDismiss,
}: {
  selectedText: string;
  onExplain: () => void;
  onDismiss: () => void;
}) {
  if (!selectedText) return null;
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
      <p className="line-clamp-2 text-xs text-stone-600">{selectedText}</p>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={onExplain}
          className="flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-3 py-2 text-sm leading-5 text-white"
        >
          Explain selection
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-9 w-full rounded-lg text-sm text-stone-500 hover:bg-white/5 hover:text-stone-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
