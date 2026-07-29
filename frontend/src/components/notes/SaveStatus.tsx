import type { SaveState } from "../../lib/types";
export function SaveStatus({
  state,
  lastSavedAt,
}: {
  state: SaveState;
  lastSavedAt: string | null;
}) {
  const labels: Record<SaveState, string> = {
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Save failed",
  };
  return (
    <span
      aria-live="polite"
      className={`inline-block w-36 whitespace-nowrap text-right tabular-nums ${
        state === "error" ? "text-red-700" : "text-stone-500"
      }`}
    >
      {labels[state]}
      {state === "saved" &&
        lastSavedAt &&
        ` · ${new Date(lastSavedAt).toLocaleTimeString()}`}
    </span>
  );
}
