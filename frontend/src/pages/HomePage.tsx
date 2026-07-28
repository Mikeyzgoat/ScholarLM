import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadBox } from "../components/documents/UploadBox";
import { DocumentCard } from "../components/documents/DocumentCard";
import { listDocuments } from "../services/documents";
export default function HomePage() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const [navigationError, setNavigationError] = useState("");
  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
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
            />
          ))}
        </motion.div>
      ) : (
        <p className="text-stone-500">No documents yet.</p>
      )}
    </motion.main>
  );
}
