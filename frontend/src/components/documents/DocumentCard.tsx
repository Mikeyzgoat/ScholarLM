import type { DocumentSummary } from "../../lib/types";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
export function DocumentCard({
  document,
  onOpen,
  onDelete,
}: {
  document: DocumentSummary;
  onOpen: (id: string) => void;
  onDelete: (document: DocumentSummary) => void;
}) {
  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      whileHover={{ y: -2, transition: { duration: 0.16 } }}
      className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-4"
    >
      <div>
        <h3 className="font-medium">{document.name}</h3>
        <p className="text-sm capitalize text-stone-500">
          {document.status} ·{" "}
          {new Date(document.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDelete(document)}
          aria-label={`Delete ${document.name}`}
          className="rounded-md border border-red-200 p-2 text-red-500 hover:bg-red-50"
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => onOpen(document.id)}
          className="rounded-md border px-3 py-1.5 hover:bg-stone-50"
        >
          Open
        </button>
      </div>
    </motion.article>
  );
}
