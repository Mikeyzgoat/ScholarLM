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
          className="group w-full rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left hover:border-orange-400/40 hover:bg-orange-500/[0.05]"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-300">
            {r.kind === "sticky" ? (
              <StickyNote size={13} />
            ) : (
              <FileText size={13} />
            )}
            {r.kind === "sticky"
              ? r.label || "Sticky note"
              : `PDF · Page ${r.pageNumber}`}
            <span className="ml-auto text-stone-500">
              {(r.score * 100).toFixed(0)}%
            </span>
          </span>
          <p className="mt-1 line-clamp-4 text-sm text-stone-700">
            {r.content}
          </p>
        </button>
      ))}
    </div>
  );
}
