import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search, Sparkles } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { KnowledgeGraph } from "../components/graph/KnowledgeGraph";
import { useDocumentStatus } from "../hooks/useDocumentStatus";
import { useKnowledgeGraph } from "../hooks/useKnowledgeGraph";
import type { GraphNode } from "../lib/types";
import { getDocument } from "../services/documents";

function fuzzyScore(query: string, value: string): number {
  const needle = query.toLowerCase().trim();
  const haystack = value.toLowerCase();
  if (!needle) return 1;
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 1000 - direct * 2 - haystack.length;
  let cursor = 0;
  let score = 0;
  let previous = -2;
  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index < 0) return -1;
    score += index === previous + 1 ? 12 : 4;
    score -= index - cursor;
    cursor = index + 1;
    previous = index;
  }
  return score;
}

export default function KnowledgeGraphPage() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const document = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    enabled: !!documentId,
  });
  const status = useDocumentStatus(documentId);
  const graph = useKnowledgeGraph(documentId, status.status?.status);
  const matches = useMemo(() => {
    if (!graph.graph?.nodes) return [];
    return graph.graph.nodes
      .map((node) => ({
        node,
        score: fuzzyScore(
          query,
          `${node.label} ${node.description ?? ""}`,
        ),
      }))
      .filter((match) => match.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, query ? 12 : 8);
  }, [graph.graph?.nodes, query]);

  const focus = useCallback((node: GraphNode) => setSelected(node), []);
  return (
    <main className="grid h-[calc(100vh-3.5rem)] min-h-[640px] grid-cols-[320px_minmax(0,1fr)] overflow-hidden bg-neutral-950">
      <aside className="z-10 overflow-auto border-r border-orange-400/10 bg-neutral-950/90 p-4 backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles size={16} className="text-orange-400" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-orange-300">
            Knowledge atlas
          </p>
        </div>
        <h1 className="truncate text-xl font-semibold">
          {document.data?.name ?? "Knowledge graph"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Search concepts fuzzily, follow their connections, and jump back to
          the source.
        </p>
        <label className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search size={16} className="text-stone-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fuzzy search concepts…"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-stone-600"
          />
        </label>
        <div className="mt-3 space-y-1.5">
          {matches.map(({ node }) => (
            <button
              key={node.id}
              type="button"
              onClick={() => focus(node)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                selected?.id === node.id
                  ? "border-orange-400/30 bg-orange-500/10"
                  : "border-transparent hover:border-white/10 hover:bg-white/5"
              }`}
            >
              <span className="block truncate text-sm font-medium">
                {node.label}
              </span>
              {node.description && (
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-stone-500">
                  {node.description}
                </span>
              )}
            </button>
          ))}
        </div>
        {selected && (
          <section className="mt-5 rounded-2xl border border-orange-400/15 bg-orange-500/5 p-4">
            <h2 className="font-medium text-orange-200">{selected.label}</h2>
            <p className="mt-2 text-xs leading-5 text-stone-400">
              {selected.description || "No description available."}
            </p>
            {selected.pageNumber && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/workspace/${documentId}?page=${selected.pageNumber}`,
                  )
                }
                className="mt-3 flex items-center gap-2 text-xs text-orange-300"
              >
                Open source page {selected.pageNumber}
                <ArrowUpRight size={14} />
              </button>
            )}
          </section>
        )}
      </aside>
      <section className="relative min-w-0 bg-[radial-gradient(circle_at_50%_45%,rgba(249,115,22,0.08),transparent_42%)]">
        {searchParams.get("duplicate") === "1" && (
          <div className="absolute left-4 top-4 z-20 rounded-xl border border-orange-400/20 bg-neutral-950/90 px-4 py-3 text-sm text-orange-200 shadow-xl backdrop-blur-xl">
            This PDF was already indexed. Reused the existing embeddings.
          </div>
        )}
        {graph.error && (
          <p className="absolute left-4 top-20 z-20 text-sm text-red-400">
            {graph.error.message}
          </p>
        )}
        <KnowledgeGraph
          graph={graph.graph}
          isLoading={graph.isLoading}
          onNodeSelect={focus}
          focusedNodeId={selected?.id}
          className="h-full"
        />
      </section>
    </main>
  );
}
