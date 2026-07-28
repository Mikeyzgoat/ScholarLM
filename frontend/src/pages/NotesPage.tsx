import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { Editor } from "tldraw";
import type { NotePage, SaveState } from "../lib/types";
import { getNote, updateNote } from "../services/notes";
import { createNote, listDocumentNotes } from "../services/notes";
import { chooseNewestNoteSource, getLocalNoteDraft } from "../lib/noteStorage";
import { useNoteAutosave } from "../hooks/useNoteAutosave";
import { NotesCanvas } from "../components/notes/NotesCanvas";
import { NotesHeader } from "../components/notes/NotesHeader";
import { NotesPagination } from "../components/notes/NotesPagination";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { drawMathPlot } from "../lib/drawMathPlot";
import { addExplanationToCanvas } from "../lib/addExplanationToCanvas";
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
    [selectedText, setSelectedText] = useState(""),
    [selectionImage, setSelectionImage] = useState<string>(),
    [title, setTitle] = useState(""),
    [titleSaveState, setTitleSaveState] = useState<SaveState | null>(null);
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
  const pages = useQuery({
    queryKey: ["notes", note?.documentId],
    queryFn: () => listDocumentNotes(note!.documentId),
    enabled: !!note?.documentId,
  });
  useEffect(() => {
    if (!note || !title.trim() || title === note.title) return;
    setTitleSaveState("unsaved");
    const timer = setTimeout(async () => {
      setTitleSaveState("saving");
      try {
        const updated = await updateNote({
          noteId: note.id,
          title: title.trim(),
          expectedRevision: note.revision,
        });
        setNote(updated);
        setTitle(updated.title);
        setTitleSaveState(null);
      } catch {
        setTitleSaveState("error");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [note?.id, note?.revision, note?.title, title]);
  if (q.isLoading) return <main className="p-6">Loading note…</main>;
  if (q.isError || !q.data || !note)
    return <main className="p-6 text-red-700">Unable to load note.</main>;
  const orderedPages = [...(pages.data ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const pageIndex = orderedPages.findIndex((page) => page.id === note.id);
  function openPage(index: number) {
    const target = orderedPages[index];
    if (target) nav(`/notes/${target.id}`);
  }
  async function addPage() {
    const created = await createNote({
      documentId: note!.documentId,
      title: `Page ${orderedPages.length + 1}`,
      metadata: { page: orderedPages.length + 1 },
      snapshot: {},
    });
    nav(`/notes/${created.id}`);
  }
  return (
    <main className="fixed inset-0 bg-white">
      <NotesHeader
        title={title}
        saveState={titleSaveState ?? autosave.saveState}
        lastSavedAt={autosave.lastSavedAt}
        onTitleChange={setTitle}
        onBack={() => nav(`/workspace/${note.documentId}`)}
      />
      <NotesPagination
        page={Math.max(1, pageIndex + 1)}
        pageCount={orderedPages.length}
        onPrevious={() => openPage(pageIndex - 1)}
        onNext={() => openPage(pageIndex + 1)}
        onCreate={() => void addPage()}
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
      <NotesCanvas
        key={note.id}
        note={note}
        onEditorReady={setEditor}
        onTextSelected={(text) => {
          setSelectedText(text);
          setSelectionImage(undefined);
        }}
        onCanvasSelection={(selection) => {
          setSelectedText(selection.text);
          setSelectionImage(selection.imageDataUrl);
        }}
      />
      <aside className="absolute bottom-4 right-4 top-28 z-20 w-80 overflow-auto rounded-xl bg-neutral-950/85 p-3 shadow-2xl backdrop-blur-xl">
        <ExplainPanel
          selectedText={selectedText}
          selectionImage={selectionImage}
          pageNumber={null}
          documentTitle={note.title}
          onPlotGenerated={(plot, equation) => {
            if (editor) drawMathPlot(editor, plot, equation);
          }}
          onExplanationGenerated={(input) => {
            if (editor) addExplanationToCanvas(editor, input);
          }}
        />
        <p className="mt-3 px-1 text-xs leading-5 text-stone-500">
          Select typed text or hand-drawn mathematics. Graphable equations are
          plotted as editable canvas shapes.
        </p>
      </aside>
    </main>
  );
}
