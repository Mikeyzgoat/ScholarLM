import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  GitFork,
  MessageSquareText,
  Plus,
  Send,
  StickyNote,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import type { Editor } from "tldraw";
import {
  getDocumentGroup,
  getDocumentGroupFileUrl,
} from "../services/documents";
import { askDocumentGroup } from "../services/rag";
import type { RagSource } from "../lib/types";
import { WorkspaceCanvas } from "../components/notes/WorkspaceCanvas";
import {
  addExplanationStickyToCanvas,
  addExplanationToCanvas,
} from "../lib/addExplanationToCanvas";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { DocumentNotes } from "../components/notes/DocumentNotes";
import { KnowledgeGraph } from "../components/graph/KnowledgeGraph";
import { getGlobalGraph } from "../services/graph";
import { drawMathPlot } from "../lib/drawMathPlot";
import { drawFlowchart } from "../lib/drawFlowchart";

type GroupInspectorTab = "explain" | "ask" | "notes" | "graph";

export default function GroupWorkspacePage() {
  const { groupId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [activePage, setActivePage] = useState(() => {
    const requested = Number(searchParams.get("page"));
    return Number.isInteger(requested) && requested > 0 ? requested : 1;
  });
  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [saved, setSaved] = useState(false);
  const [stickySources, setStickySources] = useState<RagSource[] | null>(null);
  const [inspectorTab, setInspectorTab] =
    useState<GroupInspectorTab>("explain");
  const [selectedText, setSelectedText] = useState("");
  const group = useQuery({
    queryKey: ["document-group", groupId],
    queryFn: () => getDocumentGroup(groupId),
    enabled: !!groupId,
  });
  const ask = useMutation({
    mutationFn: (value: string) =>
      askDocumentGroup({ groupId, question: value }),
    onSuccess: () => {
      setQuestion("");
      setSaved(false);
    },
  });
  const graph = useQuery({
    queryKey: ["graph", "global"],
    queryFn: getGlobalGraph,
  });

  if (group.isLoading)
    return <main className="grid min-h-[70vh] place-items-center">Opening group…</main>;
  if (group.isError || !group.data)
    return (
      <main className="p-8">
        <Link to="/upload" className="text-sm text-orange-400">
          ← Back to documents
        </Link>
        <p className="mt-6 text-red-400">
          {group.error?.message ?? "Document group was not found."}
        </p>
      </main>
    );

  const combinedPageFor = (source: {
    documentId?: string;
    pageNumber: number;
  }) => {
    let offset = 0;
    for (const document of group.data.documents) {
      if (document.id === source.documentId)
        return offset + source.pageNumber;
      offset += document.pageCount ?? 0;
    }
    return source.pageNumber;
  };
  const activeSource = (() => {
    let offset = 0;
    for (const document of group.data.documents) {
      const end = offset + (document.pageCount ?? 0);
      if (activePage <= end)
        return {
          document,
          pageNumber: Math.max(1, activePage - offset),
        };
      offset = end;
    }
    return { document: group.data.documents[0], pageNumber: 1 };
  })();
  const groupGraph = (() => {
    if (!graph.data) return undefined;
    const documentIds = new Set(
      group.data.documents.map((document) => document.id),
    );
    const nodeIds = new Set(
      graph.data.nodes
        .filter(
          (node) =>
            (node.documentId && documentIds.has(node.documentId)) ||
            (node.kind === "source" &&
              documentIds.has(node.id.replace(/^source:/, ""))),
        )
        .map((node) => node.id),
    );
    return {
      nodes: graph.data.nodes.filter((node) => nodeIds.has(node.id)),
      edges: graph.data.edges.filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
      ),
      groups: graph.data.groups.filter((item) => item.id === groupId),
    };
  })();
  const saveAnswer = (placement: RagSource) => {
    if (!ask.data || !canvasEditor) return;
    const pageNumber = combinedPageFor(placement);
    setActivePage(pageNumber);
    requestAnimationFrame(() =>
      addExplanationStickyToCanvas(canvasEditor, {
        selectedText: askedQuestion || "Group question",
        explanation: ask.data!.answer,
        pageNumber,
        mode: "explain",
        sources: ask.data!.sources.flatMap((source) =>
          source.documentId
            ? [{
                documentId: source.documentId,
                documentName: source.documentName ?? "PDF",
                pageNumber: source.pageNumber,
                groupId,
                combinedPageNumber: combinedPageFor(source),
              }]
            : [],
        ),
      }),
    );
    setSaved(true);
    setStickySources(null);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/upload"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10"
          aria-label="Back to documents"
        >
          <ArrowLeft size={17} />
        </Link>
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: group.data.color }}
        />
        <div>
          <h1 className="text-xl font-semibold">{group.data.name}</h1>
          <p className="text-xs text-stone-500">
            {group.data.documents
              .map(
                (document) =>
                  `${document.name} ${document.pageCount ?? 0} pages`,
              )
              .join(" + ")}{" "}
            · combined {group.data.pageCount} pages
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-h-[720px] overflow-hidden">
          <WorkspaceCanvas
            key={groupId}
            documentId={group.data.documents[0].id}
            groupId={groupId}
            groupName={group.data.name}
            fileUrl={getDocumentGroupFileUrl(groupId)}
            activePage={activePage}
            pageCount={group.data.pageCount}
            onPageChange={setActivePage}
            onEditorReady={setCanvasEditor}
            onPdfTextSelected={(text) => {
              setSelectedText(text);
              setInspectorTab("explain");
            }}
            onTextSelected={(text) => {
              setSelectedText(text);
              if (text) setInspectorTab("explain");
            }}
            onCanvasSelection={(selection) => {
              setSelectedText(selection.text);
              if (selection.text) setInspectorTab("explain");
            }}
          />
        </section>
        <aside className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border border-orange-400/15 bg-neutral-950/70">
          <div className="grid grid-cols-4 gap-1 border-b border-white/10 p-2">
            {([
              ["explain", MessageSquareText, "Explain"],
              ["ask", BookOpenCheck, "Ask"],
              ["notes", StickyNote, "Notes"],
              ["graph", GitFork, "Graph"],
            ] as const).map(([tab, Icon, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setInspectorTab(tab)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs ${
                  inspectorTab === tab
                    ? "bg-orange-500/15 text-orange-300"
                    : "text-stone-500 hover:bg-white/5"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          <div
            className={`${inspectorTab === "explain" ? "block" : "hidden"} min-h-0 overflow-y-auto p-4`}
          >
            <ExplainPanel
              selectedText={selectedText}
              selectedTexts={selectedText ? [selectedText] : undefined}
              documentId={activeSource.document.id}
              pageNumber={activeSource.pageNumber}
              documentTitle={activeSource.document.name}
              onPlotGenerated={(plot, equation, sourceShapeIds) => {
                if (canvasEditor)
                  drawMathPlot(canvasEditor, plot, equation, sourceShapeIds);
              }}
              onFlowchartGenerated={(flowchart, sourceShapeIds) => {
                if (canvasEditor)
                  drawFlowchart(canvasEditor, flowchart, sourceShapeIds);
              }}
              onExplanationGenerated={(input) => {
                if (canvasEditor)
                  addExplanationToCanvas(canvasEditor, {
                    ...input,
                    pageNumber: activePage,
                  });
              }}
              onExplanationStickyRequested={(input) => {
                if (canvasEditor)
                  addExplanationStickyToCanvas(canvasEditor, {
                    ...input,
                    pageNumber: activePage,
                  });
              }}
            />
          </div>
          <div
            className={`${inspectorTab === "ask" ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-y-auto p-4`}
          >
          <div className="flex items-center gap-2">
            <BookOpenCheck size={17} className="text-orange-400" />
            <h2 className="font-semibold">Ask the group</h2>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Answers search the combined index across every PDF.
          </p>

          {ask.data && (
            <article className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start gap-2">
              <p className="text-sm leading-6 text-stone-300">
                {ask.data.answer}
              </p>
                <button
                  type="button"
                  disabled={saved || !canvasEditor || !ask.data.sources.length}
                  title="Add answer to the group canvas"
                  onClick={() => {
                    const unique = [
                      ...new Map(
                        ask.data!.sources.map((source) => [
                          `${source.documentId}:${source.pageNumber}`,
                          source,
                        ]),
                      ).values(),
                    ];
                    if (unique.length === 1) saveAnswer(unique[0]);
                    else setStickySources(unique);
                  }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-orange-400/20 bg-orange-500/10 text-orange-300 disabled:text-emerald-300 disabled:opacity-70"
                  aria-label="Add answer as sticky note"
                >
                  {saved ? <Check size={15} /> : <Plus size={15} />}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ask.data.sources.map((source) => (
                  <button
                    key={source.sourceId}
                    type="button"
                    disabled={!source.documentId}
                    onClick={() => {
                      setActivePage(combinedPageFor(source));
                    }}
                    className="flex items-center gap-1 rounded-lg border border-orange-400/20 bg-orange-500/10 px-2.5 py-1.5 text-xs text-orange-300 disabled:opacity-50"
                  >
                    {source.documentName ?? "PDF"} · p.{source.pageNumber}
                  </button>
                ))}
              </div>
            </article>
          )}

          <form
            className="mt-auto pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const value = question.trim();
              if (value.length >= 3 && !ask.isPending) {
                setAskedQuestion(value);
                ask.mutate(value);
              }
            }}
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask across the combined PDFs…"
              maxLength={2000}
              className="min-h-28 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm"
            />
            <button
              type="submit"
              disabled={question.trim().length < 3 || ask.isPending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              <Send size={16} />
              {ask.isPending ? "Searching the group…" : "Answer with sources"}
            </button>
          </form>
          {ask.isError && (
            <p className="mt-3 text-xs text-red-400">{ask.error.message}</p>
          )}
          </div>
          <section
            className={`${inspectorTab === "notes" ? "block" : "hidden"} min-h-0 overflow-y-auto p-4`}
          >
            <h2 className="mb-1 font-semibold">Group canvas spaces</h2>
            <p className="mb-4 text-xs leading-5 text-stone-500">
              Notes here stay affiliated with this PDF group.
            </p>
            <DocumentNotes
              documentId={group.data.documents[0].id}
              groupId={groupId}
            />
          </section>
          <section
            className={`${inspectorTab === "graph" ? "block" : "hidden"} min-h-0 p-4`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Group knowledge graph</h2>
              <Link to="/graph" className="text-xs text-orange-300">
                Open atlas ↗
              </Link>
            </div>
            {graph.isError && (
              <p className="text-xs text-red-400">{graph.error.message}</p>
            )}
            <KnowledgeGraph
              graph={groupGraph}
              isLoading={graph.isLoading}
              onNodeSelect={(node) => {
                if (!node.documentId || !node.pageNumber) return;
                setActivePage(
                  combinedPageFor({
                    documentId: node.documentId,
                    pageNumber: node.pageNumber,
                  }),
                );
              }}
              className="h-[min(62vh,36rem)] min-h-80 w-full rounded-xl"
            />
          </section>
        </aside>
      </div>
      {stickySources && (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-orange-400/20 bg-neutral-950 p-5">
            <h2 className="font-semibold">Choose where to store the sticky</h2>
            <p className="mt-2 text-xs leading-5 text-stone-400">
              Pick its page on the combined canvas. Every source remains a
              clickable link inside the sticky.
            </p>
            <div className="mt-4 space-y-2">
              {stickySources.map((source) => (
                <button
                  key={`${source.documentId}:${source.pageNumber}`}
                  type="button"
                  onClick={() => saveAnswer(source)}
                  className="flex w-full justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs"
                >
                  <span>{source.documentName ?? "PDF"}</span>
                  <span className="font-mono text-orange-300">
                    Page {source.pageNumber}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStickySources(null)}
              className="mt-4 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-stone-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
