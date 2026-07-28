import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  createNote,
  deleteNote,
  listDocumentNotes,
} from "../../services/notes";
import { NotesList } from "./NotesList";
export function DocumentNotes({ documentId }: { documentId: string }) {
  const nav = useNavigate(),
    client = useQueryClient();
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
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notes", documentId] }),
  });
  if (q.isLoading) return <p className="text-sm">Loading notes…</p>;
  if (q.isError)
    return <p className="text-sm text-red-700">{q.error.message}</p>;
  return (
    <NotesList
      notes={q.data ?? []}
      onOpen={(id) => nav(`/notes/${id}`)}
      onCreate={() => create.mutate()}
      onDelete={(id) => remove.mutate(id)}
    />
  );
}
