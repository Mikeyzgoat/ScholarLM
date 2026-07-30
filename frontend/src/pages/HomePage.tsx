import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, FolderOpen } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { UploadBox } from "../components/documents/UploadBox";
import { DocumentCard } from "../components/documents/DocumentCard";
import { deleteDocument, listDocuments } from "../services/documents";
import type { DocumentSummary } from "../lib/types";
import { getDocumentLibraryGroups } from "../services/graph";

export default function HomePage() {
  const nav = useNavigate();
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const [navigationError, setNavigationError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(
    null,
  );
  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const graphGroups = useQuery({
    queryKey: ["graph", "document-library-groups"],
    queryFn: getDocumentLibraryGroups,
  });
  const documentSections = useMemo(() => {
    const assigned = new Set<string>();
    const grouped = (graphGroups.data ?? []).flatMap((group) => {
      const documentIds = new Set(
        group.memberNodeIds.map((id) => id.slice("source:".length)),
      );
      const documents = (q.data ?? []).filter((document) =>
        documentIds.has(document.id),
      );
      if (documents.length < 2) return [];
      documents.forEach((document) => assigned.add(document.id));
      return [{ ...group, documents }];
    });
    const ungrouped = (q.data ?? []).filter(
      (document) => !assigned.has(document.id),
    );
    return [
      ...grouped,
      ...(ungrouped.length
        ? [{
            id: "ungrouped",
            name: "Ungrouped",
            color: null,
            scope: "global" as const,
            indexStatus: "empty" as const,
            indexedCandidateCount: 0,
            memberNodeIds: [],
            documents: ungrouped,
          }]
        : []),
    ];
  }, [graphGroups.data, q.data]);
  const remove = useMutation({
    mutationFn: (document: DocumentSummary) => deleteDocument(document.id),
    onSuccess: async (_, document) => {
      setDeleteTarget(null);
      client.removeQueries({ queryKey: ["document", document.id] });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["documents"] }),
        client.invalidateQueries({ queryKey: ["notes"] }),
        client.invalidateQueries({ queryKey: ["graph"] }),
      ]);
    },
  });
  function openDocument(documentId: string) {
    setNavigationError("");
    nav(`/workspace/${documentId}`);
  }
  return (
    <motion.main
      className="mx-auto max-w-4xl p-8"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.24em] text-orange-400">
        Semantic learning system
      </p>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">
        Your learning workspace
      </h1>
      <p className="mb-8 text-stone-600">
        Upload a PDF to search, explore, and understand it.
      </p>
      <UploadBox
        onUploaded={(document) => {
          if (searchParams.get("returnTo") === "graph") {
            nav("/graph");
            return;
          }
          openDocument(document.id);
        }}
      />
      <h2 className="mb-3 mt-10 text-lg font-semibold">Recent documents</h2>
      {navigationError && (
        <p className="mb-3 text-sm text-red-400">{navigationError}</p>
      )}
      {q.isLoading ? (
        <p>Loading documents…</p>
      ) : q.isError ? (
        <p className="text-red-700">{q.error.message}</p>
      ) : q.data?.length ? (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: reduceMotion ? 0 : 0.055 },
            },
          }}
        >
          {documentSections.map((section) => (
            <Fragment key={section.id}>
              <div className="mt-6 flex items-center gap-3 first:mt-0">
                {section.color && (
                  <span
                    className="h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]"
                    style={{
                      backgroundColor: section.color,
                      color: section.color,
                    }}
                  />
                )}
                <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
                  {section.name}
                </h3>
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] text-stone-500">
                  {section.documents.length} PDF
                  {section.documents.length === 1 ? "" : "s"}
                  {section.color ? " · combined index" : ""}
                </span>
              </div>
              {section.color && (
                <>
                  <p className="text-xs leading-5 text-stone-500">
                    {section.documents
                      .map(
                        (document) =>
                          `${document.name} ${document.pageCount ?? 0} pages`,
                      )
                      .join(" + ")}{" "}
                    · combined{" "}
                    {section.documents.reduce(
                      (total, document) =>
                        total + (document.pageCount ?? 0),
                      0,
                    )}{" "}
                    pages
                  </p>
                  <button
                    type="button"
                    onClick={() => nav(`/groups/${section.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-orange-400/20 bg-orange-500/10 px-4 py-3 text-left text-sm font-medium text-orange-200 transition hover:border-orange-400/40 hover:bg-orange-500/15"
                  >
                    <span className="flex items-center gap-2">
                      <FolderOpen size={16} />
                      Open group
                    </span>
                    <span className="text-xs text-orange-300/70">
                      {section.documents.length} combined PDFs
                    </span>
                  </button>
                </>
              )}
              {!section.color &&
                section.documents.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onOpen={openDocument}
                    onDelete={(target) => {
                      remove.reset();
                      setDeleteTarget(target);
                    }}
                  />
                ))}
            </Fragment>
          ))}
        </motion.div>
      ) : (
        <p className="text-stone-500">No documents yet.</p>
      )}
      {graphGroups.isError && (
        <p className="mt-3 text-sm text-red-500">
          Document groups could not be loaded: {graphGroups.error.message}
        </p>
      )}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[1200] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-document-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-400/20 bg-neutral-950 p-5 text-stone-100 shadow-2xl">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <AlertTriangle size={20} />
            </div>
            <h2 id="delete-document-title" className="font-semibold">
              Delete “{deleteTarget.name}”?
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              The PDF file, linked notes, concepts, embeddings, sticky indexes,
              explanations, and every affiliated graph connection will be
              permanently removed.
            </p>
            {remove.isError && (
              <p className="mt-3 text-xs text-red-300">
                {remove.error.message}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleteTarget)}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {remove.isPending ? "Deleting…" : "Confirm deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.main>
  );
}
