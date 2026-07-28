import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileUp, LayoutDashboard, Save } from "lucide-react";
import { Link } from "react-router";
import { Navigate, useParams } from "react-router";
import { getSnapshot, type Editor } from "tldraw";
import type { NotePage, SaveState } from "../lib/types";
import { NotesCanvas } from "../components/notes/NotesCanvas";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { drawMathPlot } from "../lib/drawMathPlot";
import { SaveStatus } from "../components/notes/SaveStatus";
import {
  getLocalCanvas,
  loadLocalCanvasSnapshot,
  saveLocalCanvasSnapshot,
  updateLocalCanvasTitle,
} from "../lib/localCanvases";
import { addExplanationToCanvas } from "../lib/addExplanationToCanvas";
import { ThemeSelector } from "../components/layout/ThemeSelector";

export default function StandaloneCanvasPage() {
  const { canvasId = "" } = useParams();
  const canvas = getLocalCanvas(canvasId);
  const [selectedText, setSelectedText] = useState("");
  const [selectedTexts, setSelectedTexts] = useState<string[]>();
  const [selectionImage, setSelectionImage] = useState<string>();
  const [existingExplanation, setExistingExplanation] = useState<string>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [title, setTitle] = useState(canvas?.title ?? "");
  const unsubscribe = useRef<(() => void) | null>(null);
  const [note] = useState<NotePage>(() => ({
    id: canvasId,
    documentId: "",
    title: canvas?.title ?? "Untitled canvas",
    metadata: {},
    snapshot: loadLocalCanvasSnapshot(canvasId),
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const saveCanvas = useCallback((activeEditor: Editor) => {
    setSaveState("saving");
    try {
      saveLocalCanvasSnapshot(canvasId, getSnapshot(activeEditor.store));
      setLastSavedAt(new Date().toISOString());
      setSaveState("saved");
    } catch (error) {
      console.error("Could not save the independent canvas", error);
      setSaveState("error");
    }
  }, [canvasId]);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (editor) saveCanvas(editor);
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [editor, saveCanvas]);

  useEffect(() => () => unsubscribe.current?.(), []);

  function connectEditor(editor: Editor) {
    setEditor(editor);
    unsubscribe.current?.();
    const saveAfterTransaction = () => {
      setSaveState("unsaved");
      queueMicrotask(() => saveCanvas(editor));
    };
    const unsubscribeDocument = editor.store.listen(
      saveAfterTransaction,
      { scope: "document" },
    );
    let currentPageId = editor.getCurrentPageId();
    const unsubscribePage = editor.store.listen(
      () => {
        const nextPageId = editor.getCurrentPageId();
        if (nextPageId === currentPageId) return;
        currentPageId = nextPageId;
        saveAfterTransaction();
      },
      { scope: "session" },
    );
    unsubscribe.current = () => {
      unsubscribeDocument();
      unsubscribePage();
    };
  }

  function downloadBackup() {
    if (!editor) return;
    const contents = JSON.stringify(getSnapshot(editor.store), null, 2);
    const url = URL.createObjectURL(
      new Blob([contents], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `scholarlm-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!canvas) return <Navigate to="/notes" replace />;

  return (
    <main className="fixed inset-0 flex flex-col bg-neutral-950">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4">
        <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_16px_rgba(249,115,22,0.9)]" />
        <input
          value={title}
          maxLength={120}
          aria-label="Canvas name"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const updated = updateLocalCanvasTitle(canvasId, title);
            setTitle(updated?.title ?? canvas.title);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="min-w-0 max-w-64 rounded border border-transparent bg-transparent px-2 py-1 font-semibold tracking-tight outline-none hover:border-stone-300 focus:border-orange-400/40"
        />
        <span className="text-xs">
          <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
        </span>
        <ThemeSelector compact />
        <button
          type="button"
          disabled={!editor || saveState === "saving"}
          onClick={() => editor && saveCanvas(editor)}
          className="ml-auto flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-300 disabled:opacity-40"
        >
          <Save size={16} />
          Save
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={downloadBackup}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-stone-400 hover:bg-white/5 disabled:opacity-40"
          title="Download an indented JSON backup"
        >
          <Download size={16} />
          Backup
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-white/5"
        >
          <LayoutDashboard size={16} />
          Workspace
        </Link>
        <Link
          to="/upload"
          className="flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-300"
        >
          <FileUp size={16} />
          Upload PDF
        </Link>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
        <NotesCanvas
          note={note}
          embedded
          onEditorReady={connectEditor}
          onTextSelected={(text) => {
            setSelectedText(text);
            setSelectedTexts(text ? [text] : undefined);
            setExistingExplanation(undefined);
          }}
          onCanvasSelection={(selection) => {
            setSelectedText(selection.text);
            setSelectedTexts(selection.texts);
            setSelectionImage(selection.imageDataUrl);
            setExistingExplanation(selection.existingExplanation);
          }}
        />
        <aside className="overflow-auto border-l p-3">
          <ExplainPanel
            selectedText={selectedText}
            selectedTexts={selectedTexts}
            selectionImage={selectionImage}
            existingExplanation={existingExplanation}
            pageNumber={null}
            documentTitle="Independent canvas"
            onPlotGenerated={(plot, equation) => {
              if (editor) drawMathPlot(editor, plot, equation);
            }}
            onExplanationGenerated={(input) => {
              if (editor) addExplanationToCanvas(editor, input);
            }}
          />
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Select text or hand-drawn mathematics to solve and explain it
            live. Graphable equations are plotted back onto the canvas.
          </p>
        </aside>
      </div>
    </main>
  );
}
