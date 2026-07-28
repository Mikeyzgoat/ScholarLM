import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, PencilRuler, StickyNote } from "lucide-react";
import { Link } from "react-router-dom";
import type { NotePage } from "../lib/types";
import { listDocuments } from "../services/documents";
import { listDocumentNotes } from "../services/notes";

interface LibraryNote extends NotePage {
  documentName: string;
}

async function listAllNotes(): Promise<LibraryNote[]> {
  const documents = await listDocuments();
  const groups = await Promise.all(
    documents.map(async (document) => {
      const notes = await listDocumentNotes(document.id);
      return notes.map((note) => ({
        ...note,
        documentName: document.name,
      }));
    }),
  );
  return groups
    .flat()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export default function NotesLibraryPage() {
  const reduceMotion = useReducedMotion();
  const notes = useQuery({
    queryKey: ["notes", "library"],
    queryFn: listAllNotes,
  });

  return (
    <main className="mx-auto max-w-6xl p-6 md:p-8">
      <div className="mb-8">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-orange-400">
          Canvas library
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="mt-2 text-sm text-stone-500">
          Open independent sketches or document-linked canvases.
        </p>
      </div>

      <motion.div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.055 } },
        }}
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <Link
            to="/canvas"
            className="group flex min-h-44 flex-col rounded-2xl border border-orange-400/20 bg-orange-500/5 p-5 shadow-[0_0_40px_rgba(249,115,22,0.04)] transition hover:-translate-y-0.5 hover:border-orange-400/40 hover:bg-orange-500/10"
          >
            <PencilRuler size={20} className="text-orange-400" />
            <h2 className="mt-5 font-semibold">Independent canvas</h2>
            <p className="mt-1 text-xs text-stone-500">
              Local canvas · saved in this browser
            </p>
            <ArrowUpRight
              size={16}
              className="mt-auto self-end text-stone-600 transition group-hover:text-orange-300"
            />
          </Link>
        </motion.div>

        {notes.data?.map((note) => (
          <motion.div
            key={note.id}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <Link
              to={`/notes/${note.id}`}
              className="group flex min-h-44 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-orange-400/30 hover:bg-white/[0.055]"
            >
              <StickyNote size={20} className="text-orange-300" />
              <h2 className="mt-5 truncate font-semibold">{note.title}</h2>
              <p className="mt-1 truncate text-xs text-stone-500">
                {note.documentName}
              </p>
              <div className="mt-auto flex items-end justify-between pt-4">
                <span className="text-[11px] text-stone-600">
                  Updated {new Date(note.updatedAt).toLocaleString()}
                </span>
                <ArrowUpRight
                  size={16}
                  className="text-stone-600 transition group-hover:text-orange-300"
                />
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {notes.isLoading && (
        <p className="mt-6 text-sm text-stone-500">Loading notes…</p>
      )}
      {notes.isError && (
        <p className="mt-6 text-sm text-red-400">{notes.error.message}</p>
      )}
      {!notes.isLoading && !notes.isError && !notes.data?.length && (
        <p className="mt-6 text-sm text-stone-500">
          No document-linked notes yet.
        </p>
      )}
    </main>
  );
}
