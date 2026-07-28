import type { DocumentStatusResponse } from "../../lib/types";
import { motion } from "framer-motion";
const labels: Record<DocumentStatusResponse["status"], string> = {
  uploaded: "Upload saved. Preparing ingestion…",
  extracting: "Extracting page-aware text…",
  chunking: "Creating semantic chunks…",
  embedding: "Generating embeddings…",
  graphing: "Building the knowledge graph…",
  ready: "Document is ready.",
  failed: "Ingestion failed.",
};
export function IngestionStatus({
  status,
}: {
  status: DocumentStatusResponse;
}) {
  return (
    <motion.div
      key={status.status}
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24 }}
      role="status"
      className={status.status === "failed" ? "text-red-700" : "text-stone-600"}
    >
      {labels[status.status]}
      {status.errorMessage && ` ${status.errorMessage}`}
    </motion.div>
  );
}
