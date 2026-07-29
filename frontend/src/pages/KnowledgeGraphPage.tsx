import { useCallback, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  FilePlus2,
  Plus,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { KnowledgeGraph } from "../components/graph/KnowledgeGraph";
import { useDocumentStatus } from "../hooks/useDocumentStatus";
import {
  useGlobalKnowledgeGraph,
  useKnowledgeGraph,
} from "../hooks/useKnowledgeGraph";
import type { GraphNode } from "../lib/types";
import { getDocument } from "../services/documents";
import { createNote } from "../services/notes";
import { createRandomCanvasName } from "../lib/randomName";

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

function nodeIdentifier(node: GraphNode): {
  label: string;
  className: string;
} {
  if (node.kind === "sticky")
    return {
      label:
        node.stickyKind === "explanation" ? "Explanation sticky" : "Sticky",
      className: "bg-amber-400/15 text-amber-300",
    };
  if (node.kind === "handwriting")
    return {
      label: "Handwriting",
      className: "bg-rose-400/15 text-rose-300",
    };
  if (node.kind === "note")
    return {
      label: "Canvas",
      className: "bg-purple-400/15 text-purple-300",
    };
  if (node.kind === "hub")
    return {
      label: "Library",
      className: "bg-teal-400/15 text-teal-300",
    };
  return {
    label: node.kind === "source" ? "PDF" : "PDF concept",
    className: "bg-sky-400/15 text-sky-300",
  };
}

function canvasRoute(node: GraphNode): string | null {
  const search = node.shapeId
    ? `?shape=${encodeURIComponent(node.shapeId)}`
    : "";
  if (node.noteId) return `/notes/${node.noteId}${search}`;
  if (node.canvasId) return `/canvas/${node.canvasId}${search}`;
  return null;
}

export default function KnowledgeGraphPage() {
  const { documentId = "" } = useParams();
  const isGlobal = !documentId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const document = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    enabled: !!documentId,
  });
  const status = useDocumentStatus(documentId || undefined);
  const documentGraph = useKnowledgeGraph(
    documentId || undefined,
    status.status?.status,
  );
  const globalGraph = useGlobalKnowledgeGraph();
  const graph = isGlobal ? globalGraph : documentGraph;
  const linkedNotes = useMemo(
    () =>
      graph.graph?.nodes.filter(
        (node) =>
          node.kind === "note" &&
          node.documentId &&
          node.documentId === selected?.documentId,
      ) ?? [],
    [graph.graph?.nodes, selected?.documentId],
  );
  const newNote = useMutation({
    mutationFn: (sourceDocumentId: string) =>
      createNote({
        documentId: sourceDocumentId,
        title: createRandomCanvasName(),
        metadata: { source: "knowledge-graph" },
        snapshot: {},
      }),
    onSuccess: async (note) => {
      await queryClient.invalidateQueries({ queryKey: ["graph"] });
      await queryClient.invalidateQueries({
        queryKey: ["notes", note.documentId],
      });
      navigate(`/notes/${note.id}`);
    },
  });
  const matches = useMemo(() => {
    if (!graph.graph?.nodes) return [];
    return graph.graph.nodes
      .map((node) => {
        const labelScore = fuzzyScore(query, node.label);
        const descriptionScore = fuzzyScore(query, node.description ?? "");
        return {
          node,
          score: Math.max(
            labelScore < 0
              ? -1
              : labelScore + (node.kind === "sticky" ? 90 : 40),
            descriptionScore,
          ),
        };
      })
      .filter((match) => match.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, query ? 20 : 8);
  }, [graph.graph?.nodes, query]);

  const focus = useCallback((node: GraphNode) => setSelected(node), []);
  return (
    <main className="grid min-h-[calc(100vh-3.5rem)] grid-rows-[auto_minmax(420px,1fr)] overflow-hidden bg-neutral-950 lg:h-[calc(100vh-3.5rem)] lg:min-h-[640px] lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-1">
      <aside className="z-10 max-h-[46vh] overflow-auto border-b border-orange-400/10 bg-neutral-950/90 p-4 backdrop-blur-xl lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles size={16} className="text-orange-400" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-orange-300">
            Knowledge atlas
          </p>
        </div>
        <h1 className="truncate text-xl font-semibold">
          {isGlobal
            ? "Knowledge atlas"
            : document.data?.name ?? "Knowledge graph"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          {isGlobal
            ? "Every PDF becomes a source bead connected to your library."
            : "Search concepts fuzzily, follow their connections, and jump back to the source."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/upload?returnTo=graph")}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-orange-300/25 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-100 shadow-[0_8px_30px_rgba(249,115,22,0.08)] transition hover:-translate-y-0.5 hover:border-orange-300/50 hover:bg-orange-500/15"
        >
          <FilePlus2 size={16} />
          Add source
        </button>
        <label className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search size={16} className="text-stone-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fuzzy search concepts…"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-stone-600"
          />
        </label>
        {query.trim() && (
          <div className="mt-3 space-y-1.5">
            <p className="px-1 text-[11px] uppercase tracking-wide text-stone-600">
              Search results
            </p>
            {matches.map(({ node }) => {
              const identifier = nodeIdentifier(node);
              return (
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
                  <span className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${identifier.className}`}
                    >
                      {identifier.label}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {node.label}
                    </span>
                  </span>
                  {node.description && (
                    <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-stone-500">
                      {node.description}
                    </span>
                  )}
                </button>
              );
            })}
            {!matches.length && (
              <p className="px-1 py-3 text-xs text-stone-600">
                No matching nodes.
              </p>
            )}
          </div>
        )}
        {selected && (
          <section className="mt-5 rounded-2xl border border-orange-400/20 bg-gradient-to-b from-orange-500/10 to-black/20 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-orange-400/70">
                Selected node
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${nodeIdentifier(selected).className}`}
              >
                {nodeIdentifier(selected).label}
              </span>
            </div>
            <h2 className="font-medium text-orange-200">{selected.label}</h2>
            <p className="mt-2 text-xs leading-5 text-stone-400">
              {selected.description || "No description available."}
            </p>
            {selected.pageNumber && selected.documentId && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/workspace/${selected.documentId}?page=${selected.pageNumber}`,
                  )
                }
                className="mt-3 flex items-center gap-2 text-xs text-orange-300"
              >
                Open source page {selected.pageNumber}
                <ArrowUpRight size={14} />
              </button>
            )}
            {selected.kind === "sticky" && selected.noteId && (
              <button
                type="button"
                onClick={() => {
                  const route = canvasRoute(selected);
                  if (route) navigate(route);
                }}
                className="mt-3 flex items-center gap-2 text-xs text-orange-300"
              >
                Open sticky note canvas
                <ArrowUpRight size={14} />
              </button>
            )}
            {selected.kind === "handwriting" && (
              <button
                type="button"
                onClick={() => {
                  const route = canvasRoute(selected);
                  if (route) navigate(route);
                  else if (selected.documentId)
                    navigate(
                      `/workspace/${selected.documentId}${
                        selected.pageNumber
                          ? `?page=${selected.pageNumber}`
                          : ""
                      }`,
                    );
                }}
                className="mt-3 flex items-center gap-2 text-xs text-rose-300"
              >
                Open handwritten selection
                <ArrowUpRight size={14} />
              </button>
            )}
            {selected.kind === "source" && selected.documentId && (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/workspace/${selected.documentId}`)
                  }
                  className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-stone-200 hover:border-orange-400/30 hover:text-orange-200"
                >
                  <BookOpen size={14} />
                  Open document
                  <ArrowUpRight size={13} className="ml-auto" />
                </button>
                <button
                  type="button"
                  disabled={newNote.isPending}
                  onClick={() => newNote.mutate(selected.documentId!)}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-stone-200 hover:border-orange-400/30 hover:text-orange-200 disabled:opacity-50"
                >
                  <Plus size={14} />
                  {newNote.isPending ? "Creating note…" : "Open new note"}
                </button>
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-stone-500">
                    <StickyNote size={12} />
                    Existing notes
                  </p>
                  {linkedNotes.length ? (
                    <div className="space-y-1">
                      {linkedNotes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => navigate(`/notes/${note.noteId}`)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-stone-300 hover:bg-white/5 hover:text-purple-200"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                          <span className="truncate">{note.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-1 py-1 text-xs text-stone-600">
                      No linked notes yet.
                    </p>
                  )}
                </div>
                {newNote.isError && (
                  <p className="text-xs text-red-400">
                    {newNote.error.message}
                  </p>
                )}
              </div>
            )}
            {selected.kind === "note" && selected.noteId && (
              <button
                type="button"
                onClick={() => navigate(`/notes/${selected.noteId}`)}
                className="mt-3 flex items-center gap-2 text-xs text-purple-300"
              >
                Open linked note
                <ArrowUpRight size={14} />
              </button>
            )}
            {selected.kind === "note" && selected.canvasId && (
              <button
                type="button"
                onClick={() => navigate(`/canvas/${selected.canvasId}`)}
                className="mt-3 flex items-center gap-2 text-xs text-purple-300"
              >
                Open local canvas
                <ArrowUpRight size={14} />
              </button>
            )}
          </section>
        )}
      </aside>
      <section className="relative min-w-0 bg-[radial-gradient(circle_at_50%_45%,rgba(249,115,22,0.08),transparent_42%)]">
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
