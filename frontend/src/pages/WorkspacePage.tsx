import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
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
import type { GraphNode } from "../lib/types";
export default function WorkspacePage() {
  const { documentId = "" } = useParams();
  const reduceMotion = useReducedMotion();
  const [activePage, setActivePage] = useState(1);
  const [selectedText, setSelectedText] = useState("");
  const [selectedTextPage, setSelectedTextPage] = useState<number | null>(null);
  const doc = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    enabled: !!documentId,
  });
  const status = useDocumentStatus(documentId);
  const search = useSemanticSearch(documentId);
  const graph = useKnowledgeGraph(documentId, status.status?.status);
  const selectNode = useCallback((n: GraphNode) => {
    if (n.pageNumber) setActivePage(n.pageNumber);
  }, []);
  if (doc.isLoading || status.isLoading)
    return <main className="p-6">Loading workspace…</main>;
  if (doc.isError || !doc.data || !status.status)
    return <main className="p-6 text-red-700">Unable to load workspace.</main>;
  return (
    <motion.main
      className="grid gap-4 p-4 xl:grid-cols-[280px_minmax(500px,1fr)_320px]"
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
        <SearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          onSearch={search.search}
          isSearching={search.isSearching}
          disabled={status.status.status !== "ready"}
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
        {status.status.status !== "ready" && (
          <div className="mb-3 rounded border bg-white p-3">
            <IngestionStatus status={status.status} />
          </div>
        )}
        <PDFViewer
          fileUrl={getDocumentFileUrl(documentId)}
          activePage={activePage}
          onPageChange={setActivePage}
          onTextSelected={(s) => {
            setSelectedText(s.text);
            setSelectedTextPage(s.pageNumber);
          }}
        />
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
          pageNumber={selectedTextPage}
          documentTitle={doc.data.name}
        />
        <motion.section layout className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 font-semibold">Knowledge graph</h2>
          {graph.error && (
            <p className="text-sm text-red-700">{graph.error.message}</p>
          )}
          <KnowledgeGraph
            graph={graph.graph}
            isLoading={graph.isLoading}
            onNodeSelect={selectNode}
          />
        </motion.section>
      </motion.aside>
    </motion.main>
  );
}
