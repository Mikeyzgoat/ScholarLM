import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { getDocument, getDocumentFileUrl } from "../services/documents";
import { useDocumentStatus } from "../hooks/useDocumentStatus";
import { useSemanticSearch } from "../hooks/useSemanticSearch";
import { useKnowledgeGraph } from "../hooks/useKnowledgeGraph";
import { SearchBar } from "../components/search/SearchBar";
import { SearchResults } from "../components/search/SearchResults";
import { PDFViewer } from "../components/pdf/PDFViewer";
import { IngestionStatus } from "../components/documents/IngestionStatus";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { KnowledgeGraph } from "../components/graph/KnowledgeGraph";
import { DocumentNotes } from "../components/notes/DocumentNotes";
import { WorkspaceCanvas } from "../components/notes/WorkspaceCanvas";
import {
  WorkspaceModeBar,
  type WorkspaceMode,
} from "../components/layout/WorkspaceModeBar";
import type { GraphNode } from "../lib/types";
import type { Editor } from "tldraw";
import { drawMathPlot } from "../lib/drawMathPlot";
import { DocumentQA } from "../components/rag/DocumentQA";
import { addExplanationToCanvas } from "../lib/addExplanationToCanvas";
import { activateDocumentIndex } from "../services/rag";
export default function WorkspacePage() {
  const { documentId = "" } = useParams();
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
  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const queuedCanvasExplanations = useRef<
    Array<{
      selectedText: string;
      explanation: string;
      pageNumber?: number;
      mode?: "explain" | "regenerate" | "simplify";
    }>
  >([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
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
      className="grid gap-4 p-4 xl:grid-cols-[300px_minmax(720px,1fr)_320px]"
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.075 } },
      }}
    >
      <motion.aside
        variants={{
          hidden: { opacity: 0, x: -12 },
          visible: { opacity: 1, x: 0 },
        }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <DocumentQA
          documentId={documentId}
          disabled={status.status?.status !== "ready"}
          onSourceSelect={setActivePage}
        />
        <h2 className="mb-2 mt-5 text-sm font-semibold">Semantic search</h2>
        <SearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          onSearch={search.search}
          isSearching={search.isSearching}
          disabled={status.status?.status !== "ready"}
        />
        {search.error && (
          <p className="mt-2 text-sm text-red-700">{search.error.message}</p>
        )}
        <div className="mt-3">
          <SearchResults
            results={search.results}
            onSelectResult={(r) => setActivePage(r.pageNumber)}
            isLoading={search.isSearching}
          />
        </div>
        <h2 className="mb-2 mt-6 font-semibold">Notes</h2>
        <DocumentNotes documentId={documentId} />
      </motion.aside>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <WorkspaceModeBar
          mode={workspaceMode}
          onModeChange={setWorkspaceMode}
        />
        {status.status && status.status.status !== "ready" && (
          <div className="mb-3 rounded border bg-white p-3">
            <IngestionStatus status={status.status} />
          </div>
        )}
        <div
          className={
            workspaceMode === "split"
              ? "grid gap-3 2xl:grid-cols-2"
              : "grid grid-cols-1"
          }
        >
          {workspaceMode !== "canvas" && (
            <PDFViewer
              fileUrl={getDocumentFileUrl(documentId)}
              documentTitle={doc.data.name}
              activePage={activePage}
              onPageChange={setActivePage}
              onTextSelected={(s) => {
                setSelectedText(s.text);
                setSelectedTexts(s.text ? [s.text] : undefined);
                setSelectionImage(undefined);
                setExistingExplanation(undefined);
                setSelectedTextPage(s.pageNumber);
              }}
              onExplanationGenerated={saveExplanationToCanvas}
            />
          )}
          {workspaceMode !== "pdf" && (
            <WorkspaceCanvas
              key={documentId}
              documentId={documentId}
              onTextSelected={(text) => {
                setSelectedText(text);
                setSelectedTexts(text ? [text] : undefined);
                setSelectionImage(undefined);
                setExistingExplanation(undefined);
                setSelectedTextPage(null);
              }}
              onCanvasSelection={(selection) => {
                setSelectedText(selection.text);
                setSelectedTexts(selection.texts);
                setSelectionImage(selection.imageDataUrl);
                setExistingExplanation(selection.existingExplanation);
                setSelectedTextPage(null);
              }}
              onEditorReady={(editor) => {
                setCanvasEditor(editor);
                queuedCanvasExplanations.current.splice(0).forEach((item) => {
                  addExplanationToCanvas(editor, item);
                });
              }}
            />
          )}
        </div>
      </motion.div>
      <motion.aside
        className="space-y-4"
        variants={{
          hidden: { opacity: 0, x: 12 },
          visible: { opacity: 1, x: 0 },
        }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <ExplainPanel
          selectedText={selectedText}
          selectedTexts={selectedTexts}
          selectionImage={selectionImage}
          existingExplanation={existingExplanation}
          pageNumber={selectedTextPage}
          documentTitle={doc.data.name}
          onPlotGenerated={(plot, equation) => {
            if (canvasEditor) drawMathPlot(canvasEditor, plot, equation);
          }}
          onExplanationGenerated={saveExplanationToCanvas}
        />
        <motion.section layout className="min-w-0 rounded-lg border bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Knowledge graph</h2>
            <Link
              to={`/graph/${documentId}`}
              className="text-xs text-orange-300 hover:text-orange-200"
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
            className="h-[clamp(16rem,34vh,28rem)] min-h-64 w-full rounded-lg"
          />
        </motion.section>
      </motion.aside>
    </motion.main>
  );
}
