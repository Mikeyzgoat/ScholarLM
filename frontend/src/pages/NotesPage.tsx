import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { Editor, TLShapeId } from "tldraw";
import type { CanvasSelectionAnchor, NotePage, SaveState } from "../lib/types";
import { getNote, updateNote } from "../services/notes";
import { chooseNewestNoteSource, getLocalNoteDraft } from "../lib/noteStorage";
import { useNoteAutosave } from "../hooks/useNoteAutosave";
import { NotesCanvas } from "../components/notes/NotesCanvas";
import { NotesHeader } from "../components/notes/NotesHeader";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { drawMathPlot } from "../lib/drawMathPlot";
import { drawFlowchart } from "../lib/drawFlowchart";
import {
  addExplanationStickyToCanvas,
  addExplanationToCanvas,
} from "../lib/addExplanationToCanvas";
import {
  focusPdfPage,
  showPdfPageOnCanvas,
} from "../lib/pdfAnnotationCanvas";
import { getDocument, getDocumentFileUrl } from "../services/documents";
export default function NotesPage() {
  const { noteId = "" } = useParams();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const targetShapeId = searchParams.get("shape");
  const q = useQuery({
    queryKey: ["note", noteId],
    queryFn: () => getNote(noteId),
    enabled: !!noteId,
  });
  const document = useQuery({
    queryKey: ["document", q.data?.documentId],
    queryFn: () => getDocument(q.data!.documentId),
    enabled: Boolean(q.data?.documentId),
  });
  const [editor, setEditor] = useState<Editor | null>(null),
    [note, setNote] = useState<NotePage | undefined>(),
    [selectedText, setSelectedText] = useState(""),
    [selectedTexts, setSelectedTexts] = useState<string[]>(),
    [selectionImage, setSelectionImage] = useState<string>(),
    [existingExplanation, setExistingExplanation] = useState<string>(),
    [existingExplanationId, setExistingExplanationId] = useState<string>(),
    [selectedTextPage, setSelectedTextPage] = useState<number | null>(null),
    [pdfTextSelectionEnabled, setPdfTextSelectionEnabled] = useState(false),
    [selectionAnchors, setSelectionAnchors] =
      useState<CanvasSelectionAnchor[]>(),
    [title, setTitle] = useState(""),
    [canvasPage, setCanvasPage] = useState({ current: 1, total: 1 }),
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
    onServerNoteUpdated: (updated) => {
      setNote(updated);
      void queryClient.invalidateQueries({
        queryKey: ["graph", updated.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["graph", "global"],
      });
    },
  });
  useEffect(() => {
    if (!editor) return;
    const syncPage = () => {
      const pages = editor.getPages();
      const pageIndex = Math.max(
        0,
        pages.findIndex((page) => page.id === editor.getCurrentPageId()),
      );
      const pageName = pages[pageIndex]?.name ?? "";
      const pdfPage = Number(pageName.match(/^PDF · Page (\d+)$/)?.[1]);
      setCanvasPage({
        current:
          Number.isInteger(pdfPage) && pdfPage > 0 ? pdfPage : pageIndex + 1,
        total: Math.max(1, document.data?.pageCount ?? pages.length),
      });
    };
    syncPage();
    const frame = requestAnimationFrame(() => {
      const target = targetShapeId
        ? editor.getShape(targetShapeId as TLShapeId)
        : undefined;
      if (!target) {
        focusPdfPage(editor);
        return;
      }
      const pageId = editor.getAncestorPageId(target);
      if (pageId) editor.setCurrentPage(pageId);
      editor.select(target.id);
      const bounds = editor.getShapePageBounds(target);
      if (bounds)
        editor.zoomToBounds(bounds, {
          animation: { duration: 300 },
          inset: 140,
          targetZoom: 1,
        });
    });
    const unsubscribe = editor.store.listen(syncPage, { scope: "session" });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [editor, document.data?.pageCount, targetShapeId]);

  const moveCanvasPage = (offset: number) => {
    if (!editor || !note) return;
    const pageNumber = Math.max(
      1,
      Math.min(canvasPage.total, canvasPage.current + offset),
    );
    showPdfPageOnCanvas({
      editor,
      documentId: note.documentId,
      fileUrl: getDocumentFileUrl(note.documentId),
      pageNumber,
      textSelectionEnabled: pdfTextSelectionEnabled,
    });
    setCanvasPage((current) => ({ ...current, current: pageNumber }));
  };
  const togglePdfTextSelection = () => {
    if (!editor || !note) return;
    const enabled = !pdfTextSelectionEnabled;
    setPdfTextSelectionEnabled(enabled);
    showPdfPageOnCanvas({
      editor,
      documentId: note.documentId,
      fileUrl: getDocumentFileUrl(note.documentId),
      pageNumber: canvasPage.current,
      textSelectionEnabled: enabled,
    });
  };
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
  const leaveNote = async () => {
    if (autosave.isDirty) {
      const approved = window.confirm(
        "Save your canvas changes before leaving? Saving will update the search index.",
      );
      if (!approved) return;
      try {
        await autosave.flush();
      } catch {
        window.alert("The canvas could not be saved. You will remain here.");
        return;
      }
    }
    nav(`/workspace/${note.documentId}`);
  };
  const saveNote = async () => {
    try {
      await autosave.flush();
    } catch {
      window.alert("The canvas could not be saved. Please try again.");
    }
  };
  return (
    <main className="fixed inset-0 bg-white">
      <NotesHeader
        title={title}
        saveState={titleSaveState ?? autosave.saveState}
        lastSavedAt={autosave.lastSavedAt}
        onTitleChange={setTitle}
        onBack={() => void leaveNote()}
        onSave={() => void saveNote()}
        pageNavigation={{
          ...canvasPage,
          onPrevious: () => moveCanvasPage(-1),
          onNext: () => moveCanvasPage(1),
        }}
        pdfTextSelection={{
          enabled: pdfTextSelectionEnabled,
          onToggle: togglePdfTextSelection,
        }}
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
          setSelectedTexts(text ? [text] : undefined);
          setSelectionImage(undefined);
          setExistingExplanation(undefined);
          setExistingExplanationId(undefined);
          setSelectionAnchors(undefined);
          setSelectedTextPage(null);
        }}
        onCanvasSelection={(selection) => {
          setSelectedText(selection.text);
          setSelectedTexts(selection.texts);
          setSelectionImage(selection.imageDataUrl);
          setExistingExplanation(selection.existingExplanation);
          setExistingExplanationId(selection.explanationId);
          setSelectionAnchors(selection.anchors);
          setSelectedTextPage(null);
        }}
        onPdfTextSelected={(text) => {
          setSelectedText(text);
          setSelectedTexts([text]);
          setSelectionImage(undefined);
          setExistingExplanation(undefined);
          setExistingExplanationId(undefined);
          setSelectionAnchors(undefined);
          setSelectedTextPage(canvasPage.current);
        }}
      />
      <aside className="absolute bottom-4 right-4 top-28 z-20 w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-xl bg-neutral-950/85 p-3 shadow-2xl backdrop-blur-xl">
        <ExplainPanel
          selectedText={selectedText}
          selectedTexts={selectedTexts}
          selectionImage={selectionImage}
          existingExplanation={existingExplanation}
          existingExplanationId={existingExplanationId}
          selectionAnchors={selectionAnchors}
          documentId={note.documentId}
          noteId={note.id}
          pageNumber={selectedTextPage}
          documentTitle={note.title}
          onPlotGenerated={(plot, equation, sourceShapeIds) => {
            if (editor)
              drawMathPlot(editor, plot, equation, sourceShapeIds);
          }}
          onFlowchartGenerated={(flowchart, sourceShapeIds) => {
            if (editor) drawFlowchart(editor, flowchart, sourceShapeIds);
          }}
          onExplanationGenerated={(input) => {
            if (editor) addExplanationToCanvas(editor, input);
          }}
          onExplanationStickyRequested={(input) => {
            if (editor) addExplanationStickyToCanvas(editor, input);
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
