import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export function NotesPagination({
  page,
  pageCount,
  onPrevious,
  onNext,
  onCreate,
}: {
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onCreate: () => void;
}) {
  return (
    <nav
      aria-label="Note pages"
      className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-2 py-1 shadow-lg"
    >
      <button
        aria-label="Previous note page"
        disabled={page <= 1}
        onClick={onPrevious}
        className="rounded p-1 disabled:opacity-30"
      >
        <ChevronLeft size={17} />
      </button>
      <span className="min-w-20 text-center font-mono text-xs text-stone-500">
        Page {page} / {Math.max(1, pageCount)}
      </span>
      <button
        aria-label="Next note page"
        disabled={page >= pageCount}
        onClick={onNext}
        className="rounded p-1 disabled:opacity-30"
      >
        <ChevronRight size={17} />
      </button>
      <span className="h-5 border-l" />
      <button
        aria-label="Create note page"
        title="Create page"
        onClick={onCreate}
        className="rounded p-1 text-orange-300 hover:bg-orange-500/10"
      >
        <Plus size={17} />
      </button>
    </nav>
  );
}
