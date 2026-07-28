import { ArrowLeft } from "lucide-react";
import type { SaveState } from "../../lib/types";
import { SaveStatus } from "./SaveStatus";
export function NotesHeader({
  title,
  saveState,
  onTitleChange,
  onBack,
  lastSavedAt = null,
}: {
  title: string;
  saveState: SaveState;
  onTitleChange: (t: string) => void;
  onBack: () => void;
  lastSavedAt?: string | null;
}) {
  return (
    <header className="relative z-10 flex h-14 items-center gap-3 border-b bg-white px-4">
      <button aria-label="Back" onClick={onBack}>
        <ArrowLeft />
      </button>
      <input
        aria-label="Note title"
        value={title}
        maxLength={200}
        onChange={(e) => onTitleChange(e.target.value)}
        className="min-w-0 flex-1 rounded px-2 py-1 font-semibold focus:outline-2"
      />
      <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
    </header>
  );
}
