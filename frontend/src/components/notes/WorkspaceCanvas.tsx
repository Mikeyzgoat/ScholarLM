import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type { Editor } from "tldraw";
import type { NotePage } from "../../lib/types";
import { createNote, listDocumentNotes } from "../../services/notes";
import { useNoteAutosave } from "../../hooks/useNoteAutosave";
import { NotesCanvas } from "./NotesCanvas";
import { SaveStatus } from "./SaveStatus";

export function WorkspaceCanvas({
  documentId,
  documentTitle,
  onTextSelected,
}: {
  documentId: string;
  documentTitle: string;
  onTextSelected?: (text: string) => void;
}) {
  const client = useQueryClient();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [note, setNote] = useState<NotePage>();
  const [createError, setCreateError] = useState<Error | null>(null);
  const notes = useQuery({
    queryKey: ["notes", documentId],
    queryFn: () => listDocumentNotes(documentId),
  });

  useEffect(() => {
    if (notes.data?.[0] && !note) {
      setNote(notes.data[0]);
      return;
    }
    if (notes.isLoading || notes.isError || note || createError) return;
    void createNote({
      documentId,
      title: `${documentTitle} notes`,
      metadata: { page: 1 },
      snapshot: {},
    })
      .then((created) => {
        setNote(created);
        void client.invalidateQueries({ queryKey: ["notes", documentId] });
      })
      .catch((error: unknown) =>
        setCreateError(
          error instanceof Error ? error : new Error("Unable to create canvas"),
        ),
      );
  }, [
    documentId,
    documentTitle,
    notes.data,
    notes.isLoading,
    notes.isError,
    note,
    createError,
    client,
  ]);

  const autosave = useNoteAutosave({
    note,
    editor,
    onServerNoteUpdated: setNote,
  });

  if (notes.isLoading || (!note && !createError))
    return (
      <div className="grid h-[620px] place-items-center">Loading canvas…</div>
    );
  if (notes.isError || createError || !note)
    return (
      <div className="grid h-[620px] place-items-center text-red-400">
        {createError?.message ?? notes.error?.message ?? "Canvas unavailable"}
      </div>
    );

  return (
    <section className="overflow-hidden rounded-lg border bg-white">
      <header className="flex h-11 items-center border-b px-3">
        <span className="truncate text-sm font-medium">{note.title}</span>
        <span className="ml-auto mr-3 text-xs">
          <SaveStatus
            state={autosave.saveState}
            lastSavedAt={autosave.lastSavedAt}
          />
        </span>
        <Link
          to={`/notes/${note.id}`}
          aria-label="Open canvas full screen"
          className="rounded p-1 text-orange-300 hover:bg-orange-500/10"
        >
          <ExternalLink size={16} />
        </Link>
      </header>
      <NotesCanvas
        key={note.id}
        note={note}
        embedded
        onEditorReady={setEditor}
        onTextSelected={onTextSelected}
      />
    </section>
  );
}
