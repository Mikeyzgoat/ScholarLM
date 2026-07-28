import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileUp, LayoutDashboard, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { getSnapshot, type Editor } from "tldraw";
import type { NotePage, SaveState } from "../lib/types";
import { NotesCanvas } from "../components/notes/NotesCanvas";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { drawMathPlot } from "../lib/drawMathPlot";
import { SaveStatus } from "../components/notes/SaveStatus";

const storageKey = "scholarlm-standalone-canvas";

function loadLocalSnapshot(): unknown {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as unknown;
  } catch {
    return {};
  }
}

export default function StandaloneCanvasPage() {
  const [selectedText, setSelectedText] = useState("");
  const [selectionImage, setSelectionImage] = useState<string>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const [note] = useState<NotePage>(() => ({
    id: "standalone",
    documentId: "",
    title: "Independent canvas",
    metadata: {},
    snapshot: loadLocalSnapshot(),
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const saveCanvas = useCallback((activeEditor: Editor) => {
    setSaveState("saving");
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(getSnapshot(activeEditor.store)),
      );
      setLastSavedAt(new Date().toISOString());
      setSaveState("saved");
    } catch (error) {
      console.error("Could not save the independent canvas", error);
      setSaveState("error");
    }
  }, []);

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
    unsubscribe.current = editor.store.listen(
      () => {
        setSaveState("unsaved");
        saveCanvas(editor);
      },
      { scope: "document" },
    );
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

  return (
    <main className="fixed inset-0 flex flex-col bg-neutral-950">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4">
        <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_16px_rgba(249,115,22,0.9)]" />
        <strong className="tracking-tight">Independent canvas</strong>
        <span className="text-xs">
          <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
        </span>
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
          onTextSelected={setSelectedText}
          onCanvasSelection={(selection) => {
            setSelectedText(selection.text);
            setSelectionImage(selection.imageDataUrl);
          }}
        />
        <aside className="overflow-auto border-l p-3">
          <ExplainPanel
            selectedText={selectedText}
            selectionImage={selectionImage}
            pageNumber={null}
            documentTitle="Independent canvas"
            onPlotGenerated={(plot, equation) => {
              if (editor) drawMathPlot(editor, plot, equation);
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
