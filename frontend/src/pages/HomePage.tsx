import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { UploadBox } from "../components/documents/UploadBox";
import { DocumentCard } from "../components/documents/DocumentCard";
import { deleteDocument, listDocuments } from "../services/documents";
import type { DocumentSummary } from "../lib/types";
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
          {q.data.map((d) => (
            <DocumentCard
              key={d.id}
              document={d}
              onOpen={openDocument}
              onDelete={(document) => {
                remove.reset();
                setDeleteTarget(document);
              }}
            />
          ))}
        </motion.div>
      ) : (
        <p className="text-stone-500">No documents yet.</p>
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
