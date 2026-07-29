import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MousePointer2,
  Pencil,
} from "lucide-react";
import { Link } from "react-router";
import type { Editor } from "tldraw";
import type { CanvasSelection, NotePage } from "../../lib/types";
import { createNote, listDocumentNotes } from "../../services/notes";
import { useNoteAutosave } from "../../hooks/useNoteAutosave";
import { NotesCanvas } from "./NotesCanvas";
import { SaveStatus } from "./SaveStatus";
import { createRandomCanvasName } from "../../lib/randomName";
import { showPdfPageOnCanvas } from "../../lib/pdfAnnotationCanvas";

export function WorkspaceCanvas({
  documentId,
  onTextSelected,
  onCanvasSelection,
  onEditorReady,
  fileUrl,
  activePage,
  pageCount,
  onPageChange,
  onPdfTextSelected,
}: {
  documentId: string;
  onTextSelected?: (text: string) => void;
  onCanvasSelection?: (selection: CanvasSelection) => void;
  onEditorReady?: (editor: Editor) => void;
  fileUrl: string;
  activePage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPdfTextSelected?: (text: string) => void;
}) {
  const client = useQueryClient();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [note, setNote] = useState<NotePage>();
  const [createError, setCreateError] = useState<Error | null>(null);
  const [textSelectionEnabled, setTextSelectionEnabled] = useState(false);
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
      title: createRandomCanvasName(),
      metadata: { page: 1 },
      snapshot: {},
    })
      .then((created) => {
        setNote(created);
        void client.invalidateQueries({ queryKey: ["notes", documentId] });
        void client.invalidateQueries({ queryKey: ["graph"] });
      })
      .catch((error: unknown) =>
        setCreateError(
          error instanceof Error ? error : new Error("Unable to create canvas"),
        ),
      );
  }, [
    documentId,
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
    onServerNoteUpdated: (updated) => {
      setNote(updated);
      void client.invalidateQueries({ queryKey: ["graph"] });
    },
  });

  useEffect(() => {
    if (!editor) return;
    showPdfPageOnCanvas({
      editor,
      documentId,
      fileUrl,
      pageNumber: activePage,
      textSelectionEnabled,
    });
  }, [editor, documentId, fileUrl, activePage, textSelectionEnabled]);

  const navigateToPage = (pageNumber: number) => {
    const nextPage = Math.max(1, Math.min(Math.max(1, pageCount), pageNumber));
    if (editor)
      showPdfPageOnCanvas({
        editor,
        documentId,
        fileUrl,
        pageNumber: nextPage,
        textSelectionEnabled,
      });
    onPageChange(nextPage);
  };

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
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white">
      <header className="flex h-11 items-center border-b px-3">
        <span className="truncate text-sm font-medium">{note.title}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous PDF page"
            disabled={activePage <= 1}
            onClick={() => navigateToPage(activePage - 1)}
            className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-16 text-center text-xs text-stone-400">
            {activePage} / {Math.max(1, pageCount)}
          </span>
          <button
            type="button"
            aria-label="Next PDF page"
            disabled={activePage >= pageCount}
            onClick={() => navigateToPage(activePage + 1)}
            className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => setTextSelectionEnabled((value) => !value)}
            className={`ml-2 flex w-28 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs ${
              textSelectionEnabled
                ? "bg-teal-500/15 text-teal-300"
                : "bg-orange-500/15 text-orange-300"
            }`}
          >
            {textSelectionEnabled ? (
              <MousePointer2 size={14} />
            ) : (
              <Pencil size={14} />
            )}
            {textSelectionEnabled ? "Select text" : "Draw"}
          </button>
        </div>
        <span className="ml-3 mr-3 text-xs">
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
      <div className="min-h-0 flex-1">
        <NotesCanvas
          key={note.id}
          note={note}
          embedded
          onEditorReady={(nextEditor) => {
            setEditor(nextEditor);
            onEditorReady?.(nextEditor);
          }}
          onTextSelected={onTextSelected}
          onCanvasSelection={onCanvasSelection}
          onPdfTextSelected={onPdfTextSelected}
        />
      </div>
    </section>
  );
}
