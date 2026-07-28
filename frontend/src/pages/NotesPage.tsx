import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { Editor } from "tldraw";
import type { NotePage } from "../lib/types";
import { getNote, updateNote } from "../services/notes";
import { chooseNewestNoteSource, getLocalNoteDraft } from "../lib/noteStorage";
import { useNoteAutosave } from "../hooks/useNoteAutosave";
import { NotesCanvas } from "../components/notes/NotesCanvas";
import { NotesHeader } from "../components/notes/NotesHeader";
export default function NotesPage() {
  const { noteId = "" } = useParams();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["note", noteId],
    queryFn: () => getNote(noteId),
    enabled: !!noteId,
  });
  const [editor, setEditor] = useState<Editor | null>(null),
    [note, setNote] = useState<NotePage | undefined>(),
    [title, setTitle] = useState("");
  const recovered = useMemo(
    () => (q.data ? getLocalNoteDraft(q.data.id) : null),
    [q.data],
  );
  useEffect(() => {
    if (!q.data) return;
    const useLocal =
      chooseNewestNoteSource({ server: q.data, local: recovered }) === "local";
    setNote(
      useLocal && recovered
        ? {
            ...q.data,
            snapshot: recovered.snapshot,
            metadata: recovered.metadata,
          }
        : q.data,
    );
    setTitle(q.data.title);
  }, [q.data?.id]);
  const autosave = useNoteAutosave({
    note,
    editor,
    onServerNoteUpdated: setNote,
  });
  if (q.isLoading) return <main className="p-6">Loading note…</main>;
  if (q.isError || !q.data || !note)
    return <main className="p-6 text-red-700">Unable to load note.</main>;
  async function rename(value: string) {
    setTitle(value);
    if (!value.trim()) return;
    try {
      const updated = await updateNote({
        noteId,
        title: value,
        expectedRevision: note!.revision,
      });
      setNote(updated);
    } catch {}
  }
  return (
    <main className="fixed inset-0 bg-white">
      <NotesHeader
        title={title}
        saveState={autosave.saveState}
        lastSavedAt={autosave.lastSavedAt}
        onTitleChange={(value) => void rename(value)}
        onBack={() => nav(`/workspace/${note.documentId}`)}
      />
      <AnimatePresence>
        {recovered &&
          chooseNewestNoteSource({ server: q.data, local: recovered }) ===
            "local" && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-4 top-16 z-20 rounded border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-xs backdrop-blur-xl"
            >
              Recovered newer local changes.
            </motion.div>
          )}
      </AnimatePresence>
      <NotesCanvas note={note} onEditorReady={setEditor} />
    </main>
  );
}
