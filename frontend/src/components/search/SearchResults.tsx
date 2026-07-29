import { FileText, StickyNote } from "lucide-react";
import type { SearchResult } from "../../lib/types";
export function SearchResults({
  results,
  onSelectResult,
  isLoading,
}: {
  results: SearchResult[];
  onSelectResult: (r: SearchResult) => void;
  isLoading: boolean;
}) {
  if (isLoading) return <p className="py-4 text-sm">Searching…</p>;
  if (!results.length)
    return <p className="py-4 text-sm text-stone-500">No search results.</p>;
  return (
    <div className="space-y-2">
      {results.map((r) => (
        <button
          key={r.chunkId}
          onClick={() => onSelectResult(r)}
          className={`group w-full rounded-xl border p-3 text-left transition ${
            r.kind === "sticky"
              ? "border-amber-400/20 bg-amber-500/[0.045] hover:border-amber-400/50 hover:bg-amber-500/[0.08]"
              : "border-sky-400/20 bg-sky-500/[0.04] hover:border-sky-400/50 hover:bg-sky-500/[0.08]"
          }`}
        >
          <span className="flex items-center gap-2 text-[11px] font-semibold">
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 uppercase tracking-[0.08em] ${
                r.kind === "sticky"
                  ? "bg-amber-400/15 text-amber-300"
                  : "bg-sky-400/15 text-sky-300"
              }`}
            >
              {r.kind === "sticky" ? (
                <StickyNote size={12} />
              ) : (
                <FileText size={12} />
              )}
              {r.kind === "sticky" ? "Sticky" : "PDF"}
            </span>
            <span className="min-w-0 truncate text-stone-400">
              {r.kind === "sticky"
                ? r.label || "Sticky note"
                : `Page ${r.pageNumber}`}
            </span>
            <span className="ml-auto text-stone-500">
              {(r.score * 100).toFixed(0)}%
            </span>
          </span>
          {r.kind === "sticky" && r.pageNumber && (
            <span className="mt-1.5 block text-[10px] text-amber-400/70">
              Linked to PDF page {r.pageNumber}
            </span>
          )}
          <p className="mt-1 line-clamp-4 text-sm text-stone-700">
            {r.content}
          </p>
        </button>
      ))}
    </div>
  );
}
