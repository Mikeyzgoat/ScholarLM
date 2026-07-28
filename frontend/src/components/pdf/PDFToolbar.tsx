import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
export function PDFToolbar({
  page,
  pageCount,
  zoom,
  onPreviousPage,
  onNextPage,
  onPageChange,
  onZoomIn,
  onZoomOut,
}: {
  page: number;
  pageCount: number;
  zoom: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageChange: (p: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b bg-white p-2">
      <button
        aria-label="Previous page"
        onClick={onPreviousPage}
        disabled={page <= 1}
      >
        <ChevronLeft />
      </button>
      <input
        aria-label="Page"
        type="number"
        min={1}
        max={pageCount}
        value={page}
        onChange={(e) => onPageChange(Number(e.target.value))}
        className="w-14 rounded border px-1"
      />{" "}
      / {pageCount}
      <button
        aria-label="Next page"
        onClick={onNextPage}
        disabled={page >= pageCount}
      >
        <ChevronRight />
      </button>
      <span className="mx-2 h-5 border-l" />
      <button aria-label="Zoom out" onClick={onZoomOut}>
        <Minus />
      </button>
      <span className="text-sm">{Math.round(zoom * 100)}%</span>
      <button aria-label="Zoom in" onClick={onZoomIn}>
        <Plus />
      </button>
    </div>
  );
}
