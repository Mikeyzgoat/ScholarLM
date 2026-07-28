import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { AlertTriangle } from "lucide-react";
import type { NotePage } from "../../lib/types";
import {
  createNote,
  deleteNote,
  listDocumentNotes,
} from "../../services/notes";
import { NotesList } from "./NotesList";
export function DocumentNotes({ documentId }: { documentId: string }) {
  const nav = useNavigate(),
    client = useQueryClient();
  const [noteToDelete, setNoteToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const q = useQuery({
    queryKey: ["notes", documentId],
    queryFn: () => listDocumentNotes(documentId),
  });
  const create = useMutation({
    mutationFn: () =>
      createNote({
        documentId,
        title: "Untitled note",
        metadata: {},
        snapshot: {},
      }),
    onSuccess: (n) => nav(`/notes/${n.id}`),
  });
  const remove = useMutation({
    mutationFn: deleteNote,
    onMutate: async (deletedId) => {
      await client.cancelQueries({ queryKey: ["notes"] });
      const previous = client.getQueriesData<NotePage[]>({
        queryKey: ["notes"],
      });
      client.setQueriesData<NotePage[]>(
        { queryKey: ["notes"] },
        (notes) => notes?.filter((note) => note.id !== deletedId) ?? [],
      );
      return { previous };
    },
    onSuccess: (_, deletedId) => {
      client.removeQueries({ queryKey: ["note", deletedId], exact: true });
      setNoteToDelete(null);
    },
    onError: (_error, _deletedId, context) => {
      context?.previous.forEach(([queryKey, notes]) => {
        client.setQueryData(queryKey, notes);
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["notes"] }),
  });
  if (q.isLoading) return <p className="text-sm">Loading notes…</p>;
  if (q.isError)
    return <p className="text-sm text-red-700">{q.error.message}</p>;
  return (
    <>
      <NotesList
        notes={q.data ?? []}
        onOpen={(id) => nav(`/notes/${id}`)}
        onCreate={() => create.mutate()}
        onDelete={(id) => {
          const note = q.data?.find((item) => item.id === id);
          if (note) setNoteToDelete({ id: note.id, title: note.title });
        }}
      />
      {remove.isError && (
        <p className="mt-2 text-xs text-red-400">
          Could not delete the note: {remove.error.message}
        </p>
      )}
      {noteToDelete && (
        <div
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-note-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !remove.isPending)
              setNoteToDelete(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-orange-400/20 bg-neutral-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_40px_rgba(249,115,22,0.08)]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <AlertTriangle size={20} />
            </div>
            <h2 id="delete-note-title" className="text-base font-semibold">
              Delete this note?
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              “{noteToDelete.title}” and its locally saved draft will be
              permanently removed.
            </p>
            {remove.isError && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {remove.error.message}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-stone-300 hover:bg-white/5"
                disabled={remove.isPending}
                onClick={() => setNoteToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => remove.mutate(noteToDelete.id)}
              >
                {remove.isPending ? "Deleting…" : "Delete note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
