import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Pencil,
  PencilRuler,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { NotePage } from "../lib/types";
import { listDocuments } from "../services/documents";
import { listDocumentNotes, updateNote } from "../services/notes";
import {
  createLocalCanvas,
  listLocalCanvases,
} from "../lib/localCanvases";

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
  const navigate = useNavigate();
  const client = useQueryClient();
  const [localCanvases] = useState(() => listLocalCanvases());
  const [renaming, setRenaming] = useState<LibraryNote | null>(null);
  const [nextTitle, setNextTitle] = useState("");
  const notes = useQuery({
    queryKey: ["notes", "library"],
    queryFn: listAllNotes,
  });
  const rename = useMutation({
    mutationFn: (note: LibraryNote) =>
      updateNote({
        noteId: note.id,
        title: nextTitle.trim(),
        expectedRevision: note.revision,
      }),
    onSuccess: (updated) => {
      client.setQueriesData<LibraryNote[]>(
        { queryKey: ["notes"] },
        (items) =>
          items?.map((item) =>
            item.id === updated.id
              ? {
                  ...item,
                  ...updated,
                  documentName: item.documentName,
                }
              : item,
          ),
      );
      client.setQueryData(["note", updated.id], updated);
      setRenaming(null);
      setNextTitle("");
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["notes"] }),
  });

  function beginRename(note: LibraryNote) {
    rename.reset();
    setRenaming(note);
    setNextTitle(note.title);
  }

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
          <button
            type="button"
            onClick={() => {
              const canvas = createLocalCanvas();
              navigate(`/canvas/${canvas.id}`);
            }}
            className="group flex min-h-44 flex-col rounded-2xl border border-orange-400/20 bg-orange-500/5 p-5 shadow-[0_0_40px_rgba(249,115,22,0.04)] transition hover:-translate-y-0.5 hover:border-orange-400/40 hover:bg-orange-500/10"
          >
            <Plus size={20} className="text-orange-400" />
            <h2 className="mt-5 font-semibold">New empty canvas</h2>
            <p className="mt-1 text-xs text-stone-500">
              Create a separate local note
            </p>
            <ArrowUpRight
              size={16}
              className="mt-auto self-end text-stone-600 transition group-hover:text-orange-300"
            />
          </button>
        </motion.div>

        {localCanvases.map((canvas) => (
          <motion.div
            key={canvas.id}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <Link
              to={`/canvas/${canvas.id}`}
              className="group flex min-h-44 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-orange-400/30 hover:bg-white/[0.055]"
            >
              <PencilRuler size={20} className="text-orange-300" />
              <h2 className="mt-5 truncate font-semibold">{canvas.title}</h2>
              <p className="mt-1 text-xs text-stone-500">
                Local canvas · saved in this browser
              </p>
              <div className="mt-auto flex items-end justify-between pt-4">
                <span className="text-[11px] text-stone-600">
                  Updated {new Date(canvas.updatedAt).toLocaleString()}
                </span>
                <ArrowUpRight
                  size={16}
                  className="text-stone-600 transition group-hover:text-orange-300"
                />
              </div>
            </Link>
          </motion.div>
        ))}

        {notes.data?.map((note) => (
          <motion.div
            key={note.id}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <motion.div
              role="link"
              tabIndex={renaming?.id === note.id ? -1 : 0}
              aria-label={`Open ${note.title}`}
              onClick={(event) => {
                if (
                  renaming?.id !== note.id &&
                  !(event.target as HTMLElement).closest(
                    "button, a, input",
                  )
                )
                  navigate(`/notes/${note.id}`);
              }}
              onKeyDown={(event) => {
                if (
                  renaming?.id !== note.id &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  navigate(`/notes/${note.id}`);
                }
              }}
              whileHover={
                reduceMotion
                  ? undefined
                  : { y: -4, scale: 1.012 }
              }
              whileTap={reduceMotion ? undefined : { scale: 0.994 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="glass-note-card group flex min-h-44 cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-5 outline-none backdrop-blur-xl focus-visible:border-orange-300/60 focus-visible:ring-2 focus-visible:ring-orange-400/20"
            >
              <div className="flex items-center justify-between">
                <StickyNote size={20} className="text-orange-300" />
                <button
                  type="button"
                  aria-label={`Rename ${note.title}`}
                  onClick={() => beginRename(note)}
                  className="rounded-lg p-2 text-stone-500 hover:bg-white/5 hover:text-orange-300"
                >
                  <Pencil size={15} />
                </button>
              </div>
              {renaming?.id === note.id ? (
                <div className="mt-4">
                  <input
                    autoFocus
                    value={nextTitle}
                    maxLength={200}
                    onChange={(event) => setNextTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        nextTitle.trim() &&
                        !rename.isPending
                      )
                        rename.mutate(note);
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    className="w-full rounded-lg border border-orange-400/30 bg-black/20 px-3 py-2 text-sm outline-none focus:border-orange-400"
                    aria-label="New note title"
                  />
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      type="button"
                      aria-label="Cancel rename"
                      onClick={() => setRenaming(null)}
                      className="rounded p-1.5 text-stone-500 hover:bg-white/5"
                    >
                      <X size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Save note name"
                      disabled={!nextTitle.trim() || rename.isPending}
                      onClick={() => rename.mutate(note)}
                      className="rounded bg-orange-500/15 p-1.5 text-orange-300 disabled:opacity-40"
                    >
                      <Check size={15} />
                    </button>
                  </div>
                  {rename.isError && (
                    <p className="mt-2 text-xs text-red-400">
                      {rename.error.message}
                    </p>
                  )}
                </div>
              ) : (
                <h2 className="mt-4 truncate font-semibold">{note.title}</h2>
              )}
              <p className="mt-1 truncate text-xs text-stone-500">
                {note.documentName}
              </p>
              <div className="mt-auto flex items-end justify-between pt-4">
                <span className="text-[11px] text-stone-600">
                  Updated {new Date(note.updatedAt).toLocaleString()}
                </span>
                <Link
                  to={`/notes/${note.id}`}
                  className="relative z-10 flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs text-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition duration-200 hover:border-orange-300/35 hover:bg-orange-500/10 hover:text-orange-200 hover:shadow-[0_8px_28px_rgba(249,115,22,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/30"
                >
                  Open
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </motion.div>
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
