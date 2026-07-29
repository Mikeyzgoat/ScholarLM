import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  getDocument,
  getDocumentFileUrl,
  reindexDocument,
  retryDocumentIngestion,
} from "../services/documents";
import { useDocumentStatus } from "../hooks/useDocumentStatus";
import { useSemanticSearch } from "../hooks/useSemanticSearch";
import { useKnowledgeGraph } from "../hooks/useKnowledgeGraph";
import { SearchBar } from "../components/search/SearchBar";
import { SearchResults } from "../components/search/SearchResults";
import { IngestionStatus } from "../components/documents/IngestionStatus";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { KnowledgeGraph } from "../components/graph/KnowledgeGraph";
import { DocumentNotes } from "../components/notes/DocumentNotes";
import { WorkspaceCanvas } from "../components/notes/WorkspaceCanvas";
import type { CanvasSelectionAnchor, GraphNode } from "../lib/types";
import type { Editor } from "tldraw";
import { drawMathPlot } from "../lib/drawMathPlot";
import { DocumentQA } from "../components/rag/DocumentQA";
import {
  addExplanationStickyToCanvas,
  addExplanationToCanvas,
} from "../lib/addExplanationToCanvas";
import { activateDocumentIndex } from "../services/rag";
import { showPdfPageOnCanvas } from "../lib/pdfAnnotationCanvas";
import {
  BookOpenCheck,
  GitFork,
  MessageSquareText,
  Search,
  StickyNote,
  RefreshCw,
} from "lucide-react";

type InspectorTab = "explain" | "ask" | "search" | "notes" | "graph";

export default function WorkspacePage() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const [activePage, setActivePage] = useState(() => {
    const requested = Number(searchParams.get("page"));
    return Number.isInteger(requested) && requested > 0 ? requested : 1;
  });
  const [selectedText, setSelectedText] = useState("");
  const [selectedTexts, setSelectedTexts] = useState<string[]>();
  const [selectedTextPage, setSelectedTextPage] = useState<number | null>(null);
  const [selectionImage, setSelectionImage] = useState<string>();
  const [existingExplanation, setExistingExplanation] = useState<string>();
  const [existingExplanationId, setExistingExplanationId] = useState<string>();
  const [selectionAnchors, setSelectionAnchors] =
    useState<CanvasSelectionAnchor[]>();
  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTab>("explain");
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [isReindexing, setIsReindexing] = useState(false);
  const queuedCanvasExplanations = useRef<
    Array<{
      selectedText: string;
      explanation: string;
      pageNumber?: number;
      mode?: "explain" | "regenerate" | "simplify";
      answers?: string[];
      anchors?: CanvasSelectionAnchor[];
    }>
  >([]);
  const doc = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    enabled: !!documentId,
  });
  const status = useDocumentStatus(documentId);
  const search = useSemanticSearch(documentId);
  const graph = useKnowledgeGraph(documentId, status.status?.status);
  useEffect(() => {
    if (!documentId || status.status?.status !== "ready") return;
    void activateDocumentIndex(documentId).catch((error) => {
      console.warn("Could not prewarm the active PDF index", error);
    });
  }, [documentId, status.status?.status]);
  const selectNode = useCallback((n: GraphNode) => {
    if (n.pageNumber) setActivePage(n.pageNumber);
  }, []);
  const saveExplanationToCanvas = useCallback(
    (input: {
      selectedText: string;
      explanation: string;
      pageNumber?: number;
      mode?: "explain" | "regenerate" | "simplify";
      answers?: string[];
      anchors?: CanvasSelectionAnchor[];
    }) => {
      if (canvasEditor) addExplanationToCanvas(canvasEditor, input);
      else queuedCanvasExplanations.current.push(input);
    },
    [canvasEditor],
  );
  if (doc.isLoading)
    return <main className="p-6">Loading workspace…</main>;
  if (doc.isError || !doc.data)
    return <main className="p-6 text-red-700">Unable to load workspace.</main>;
  return (
    <motion.main
      className="grid min-h-[calc(100dvh-3.5rem)] gap-3 p-3 lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(360px,410px)] lg:overflow-hidden"
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.075 } },
      }}
    >
      <motion.div
        className="relative min-h-[720px] min-w-0 lg:min-h-0"
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {status.status && status.status.status !== "ready" && (
          <div className="absolute left-3 right-3 top-3 z-30 flex items-center gap-3 rounded-xl border bg-white/90 p-3 shadow-xl backdrop-blur-xl">
            <IngestionStatus status={status.status} />
            {status.status.status === "failed" && (
              <button
                type="button"
                disabled={isRetrying}
                className="scholar-primary-action ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                onClick={async () => {
                  setIsRetrying(true);
                  setRetryError("");
                  try {
                    await retryDocumentIngestion(documentId);
                    await status.refetch();
                  } catch (error) {
                    setRetryError(
                      error instanceof Error
                        ? error.message
                        : "Could not retry ingestion",
                    );
                  } finally {
                    setIsRetrying(false);
                  }
                }}
              >
                {isRetrying ? "Retrying…" : "Retry ingestion"}
              </button>
            )}
            {retryError && (
              <span className="text-xs text-red-400">{retryError}</span>
            )}
          </div>
        )}
        <WorkspaceCanvas
          key={documentId}
          documentId={documentId}
          fileUrl={getDocumentFileUrl(documentId)}
          activePage={activePage}
          pageCount={doc.data.pageCount ?? 1}
          onPageChange={setActivePage}
          onPdfTextSelected={(text) => {
            setInspectorTab("explain");
            setSelectedText(text);
            setSelectedTexts([text]);
            setSelectionImage(undefined);
            setExistingExplanation(undefined);
            setExistingExplanationId(undefined);
            setSelectionAnchors(undefined);
            setSelectedTextPage(activePage);
          }}
          onTextSelected={(text) => {
            if (text) setInspectorTab("explain");
            setSelectedText(text);
            setSelectedTexts(text ? [text] : undefined);
            setSelectionImage(undefined);
            setExistingExplanation(undefined);
            setExistingExplanationId(undefined);
            setSelectionAnchors(undefined);
            setSelectedTextPage(null);
          }}
          onCanvasSelection={(selection) => {
            if (selection.text || selection.imageDataUrl)
              setInspectorTab("explain");
            setSelectedText(selection.text);
            setSelectedTexts(selection.texts);
            setSelectionImage(selection.imageDataUrl);
            setExistingExplanation(selection.existingExplanation);
            setExistingExplanationId(selection.explanationId);
            setSelectionAnchors(selection.anchors);
            setSelectedTextPage(null);
          }}
          onEditorReady={(editor) => {
            setCanvasEditor(editor);
            queuedCanvasExplanations.current.splice(0).forEach((item) => {
              addExplanationToCanvas(editor, item);
            });
          }}
        />
      </motion.div>
      <motion.aside
        className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-white lg:min-h-0"
        variants={{
          hidden: { opacity: 0, x: 12 },
          visible: { opacity: 1, x: 0 },
        }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <div className="border-b px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
            Research inspector
          </p>
          <h2 className="mt-1 truncate text-sm font-semibold">{doc.data.name}</h2>
        </div>
        <div
          className="grid grid-cols-5 gap-1 border-b p-2"
          role="tablist"
          aria-label="Workspace tools"
        >
          {([
            ["explain", MessageSquareText, "Explain"],
            ["ask", BookOpenCheck, "Ask"],
            ["search", Search, "Search"],
            ["notes", StickyNote, "Notes"],
            ["graph", GitFork, "Graph"],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={inspectorTab === id}
              onClick={() => setInspectorTab(id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${
                inspectorTab === id
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-stone-500 hover:bg-white/5 hover:text-stone-300"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {inspectorTab === "explain" && (
            <ExplainPanel
              selectedText={selectedText}
              selectedTexts={selectedTexts}
              selectionImage={selectionImage}
              existingExplanation={existingExplanation}
              existingExplanationId={existingExplanationId}
              selectionAnchors={selectionAnchors}
              documentId={documentId}
              pageNumber={selectedTextPage}
              documentTitle={doc.data.name}
              onPlotGenerated={(plot, equation, sourceShapeIds) => {
                if (canvasEditor)
                  drawMathPlot(
                    canvasEditor,
                    plot,
                    equation,
                    sourceShapeIds,
                  );
              }}
              onExplanationGenerated={saveExplanationToCanvas}
              onExplanationStickyRequested={(input) => {
                if (canvasEditor)
                  addExplanationStickyToCanvas(canvasEditor, input);
              }}
            />
          )}
          {inspectorTab === "ask" && (
            <DocumentQA
              documentId={documentId}
              disabled={status.status?.status !== "ready"}
              onSourceSelect={setActivePage}
              activePage={activePage}
              onAddSticky={({ question, answer, pageNumber }) => {
                setActivePage(pageNumber);
                if (!canvasEditor) return;
                showPdfPageOnCanvas({
                  editor: canvasEditor,
                  documentId,
                  fileUrl: getDocumentFileUrl(documentId),
                  pageNumber,
                  textSelectionEnabled: false,
                });
                requestAnimationFrame(() =>
                  addExplanationStickyToCanvas(canvasEditor, {
                    selectedText: question,
                    explanation: answer,
                    pageNumber,
                    mode: "explain",
                  }),
                );
              }}
            />
          )}
          {inspectorTab === "search" && (
            <section className="p-1">
              <div className="mb-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">Search your workspace</h2>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    PDF passages and sticky notes are indexed together.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    isReindexing || status.status?.status !== "ready"
                  }
                  title="Rebuild embeddings while ignoring repeated PDF watermarks and headers"
                  onClick={async () => {
                    setIsReindexing(true);
                    setRetryError("");
                    try {
                      await reindexDocument(documentId);
                      search.clear();
                      await status.refetch();
                    } catch (error) {
                      setRetryError(
                        error instanceof Error
                          ? error.message
                          : "Could not rebuild the index",
                      );
                    } finally {
                      setIsReindexing(false);
                    }
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-400/20 bg-orange-500/10 px-2.5 py-1.5 text-[11px] text-orange-300 hover:bg-orange-500/20 disabled:opacity-40"
                >
                  <RefreshCw
                    size={13}
                    className={isReindexing ? "animate-spin" : undefined}
                  />
                  Rebuild index
                </button>
              </div>
              {retryError && status.status?.status === "ready" && (
                <p className="mb-3 text-xs text-red-400">{retryError}</p>
              )}
              <SearchBar
                query={search.query}
                onQueryChange={search.setQuery}
                onSearch={search.search}
                isSearching={search.isSearching}
                disabled={status.status?.status !== "ready"}
              />
              {search.error && (
                <p className="mt-2 text-sm text-red-700">
                  {search.error.message}
                </p>
              )}
              <div className="mt-3">
                <SearchResults
                  results={search.results}
                  onSelectResult={(result) => {
                    if (result.kind === "sticky" && result.noteId)
                      navigate(
                        `/notes/${result.noteId}${
                          result.shapeId
                            ? `?shape=${encodeURIComponent(result.shapeId)}`
                            : ""
                        }`,
                      );
                    else if (result.pageNumber)
                      setActivePage(result.pageNumber);
                  }}
                  isLoading={search.isSearching}
                />
              </div>
            </section>
          )}
          {inspectorTab === "notes" && (
            <section className="p-1">
              <h2 className="mb-1 font-semibold">Canvas spaces</h2>
              <p className="mb-4 text-xs leading-5 text-stone-500">
                Keep separate thought spaces without moving your PDF around.
              </p>
              <DocumentNotes documentId={documentId} />
            </section>
          )}
          {inspectorTab === "graph" && (
            <section className="min-w-0 p-1">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Knowledge graph</h2>
                  <p className="mt-1 text-xs text-stone-500">
                    Concepts, canvases, and stickies.
                  </p>
                </div>
                <Link
                  to={`/graph/${documentId}`}
                  className="shrink-0 text-xs text-orange-300 hover:text-orange-200"
                >
                  Open atlas ↗
                </Link>
              </div>
              {graph.error && (
                <p className="text-sm text-red-700">{graph.error.message}</p>
              )}
              <KnowledgeGraph
                graph={graph.graph}
                isLoading={graph.isLoading}
                onNodeSelect={selectNode}
                className="h-[min(62vh,36rem)] min-h-80 w-full rounded-xl"
              />
            </section>
          )}
        </div>
      </motion.aside>
    </motion.main>
  );
}
