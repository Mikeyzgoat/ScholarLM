import { ArrowLeft, ChevronLeft, ChevronRight, FileUp } from "lucide-react";
import { Link } from "react-router";
import type { SaveState } from "../../lib/types";
import { SaveStatus } from "./SaveStatus";
import { ThemeSelector } from "../layout/ThemeSelector";
export function NotesHeader({
  title,
  saveState,
  onTitleChange,
  onBack,
  lastSavedAt = null,
  pageNavigation,
}: {
  title: string;
  saveState: SaveState;
  onTitleChange: (t: string) => void;
  onBack: () => void;
  lastSavedAt?: string | null;
  pageNavigation?: {
    current: number;
    total: number;
    onPrevious: () => void;
    onNext: () => void;
  };
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
      {pageNavigation && pageNavigation.total > 0 && (
        <div className="flex items-center gap-1 rounded-lg border px-1.5 py-1">
          <button
            type="button"
            aria-label="Previous PDF page"
            disabled={pageNavigation.current <= 1}
            onClick={pageNavigation.onPrevious}
            className="rounded p-1 hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-20 text-center text-xs text-stone-400">
            Page {pageNavigation.current} / {pageNavigation.total}
          </span>
          <button
            type="button"
            aria-label="Next PDF page"
            disabled={pageNavigation.current >= pageNavigation.total}
            onClick={pageNavigation.onNext}
            className="rounded p-1 hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
      <ThemeSelector compact />
      <Link
        to="/upload"
        className="ml-2 flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-300 hover:border-orange-400/40"
      >
        <FileUp size={16} />
        Upload PDF
      </Link>
    </header>
  );
}
