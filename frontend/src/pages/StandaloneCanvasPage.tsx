import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileUp, LayoutDashboard, Save } from "lucide-react";
import { Link } from "react-router";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { getSnapshot, type Editor, type TLShapeId } from "tldraw";
import type { CanvasSelectionAnchor, NotePage, SaveState } from "../lib/types";
import { NotesCanvas } from "../components/notes/NotesCanvas";
import { ExplainPanel } from "../components/explanation/ExplainPanel";
import { drawMathPlot } from "../lib/drawMathPlot";
import { drawFlowchart } from "../lib/drawFlowchart";
import { SaveStatus } from "../components/notes/SaveStatus";
import {
  getLocalCanvas,
  loadLocalCanvasSnapshot,
  saveLocalCanvasSnapshot,
  updateLocalCanvasTitle,
} from "../lib/localCanvases";
import {
  addExplanationStickyToCanvas,
  addExplanationToCanvas,
} from "../lib/addExplanationToCanvas";
import { ThemeSelector } from "../components/layout/ThemeSelector";
import { uploadDocument } from "../services/documents";
import { createNote } from "../services/notes";
import { saveStandaloneCanvas } from "../services/canvases";

export default function StandaloneCanvasPage() {
  const { canvasId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetShapeId = searchParams.get("shape");
  const canvas = getLocalCanvas(canvasId);
  const [selectedText, setSelectedText] = useState("");
  const [selectedTexts, setSelectedTexts] = useState<string[]>();
  const [selectionImage, setSelectionImage] = useState<string>();
  const [existingExplanation, setExistingExplanation] = useState<string>();
  const [selectionAnchors, setSelectionAnchors] =
    useState<CanvasSelectionAnchor[]>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [title, setTitle] = useState(canvas?.title ?? "");
  const unsubscribe = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRun = useRef(0);
  const serverRevision = useRef<number | undefined>(undefined);
  const titleRef = useRef(title);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
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
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  const saveCanvas = useCallback((activeEditor: Editor): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const snapshot = getSnapshot(activeEditor.store);
    const run = ++saveRun.current;
    setSaveState("saving");
    try {
      saveLocalCanvasSnapshot(canvasId, snapshot);
    } catch (error) {
      console.error("Could not save the independent canvas", error);
      setSaveState("error");
      return Promise.reject(error);
    }
    const operation = saveQueue.current.then(async () => {
      try {
        const saved = await saveStandaloneCanvas({
          canvasId,
          title: titleRef.current.trim() || "Untitled canvas",
          snapshot,
          expectedRevision: serverRevision.current,
        });
        serverRevision.current = saved.revision;
        if (run === saveRun.current) {
          setLastSavedAt(saved.updatedAt);
          setSaveState("saved");
        }
      } catch (error) {
        console.error("Could not persist the canvas to the database", error);
        if (run === saveRun.current) setSaveState("error");
        throw error;
      }
    });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }, [canvasId]);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (editor) void saveCanvas(editor);
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [editor, saveCanvas]);

  useEffect(
    () => () => {
      unsubscribe.current?.();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  function connectEditor(editor: Editor) {
    setEditor(editor);
    unsubscribe.current?.();
    const saveAfterTransaction = () => {
      setSaveState("unsaved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveCanvas(editor), 650);
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
    void saveCanvas(editor);
    if (targetShapeId)
      requestAnimationFrame(() => {
        const target = editor.getShape(targetShapeId as TLShapeId);
        if (!target) return;
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

  async function attachPdf(file?: File) {
    if (!file || !editor || isUploading) return;
    setUploadError("");
    setIsUploading(true);
    try {
      await saveCanvas(editor);
      const document = await uploadDocument(file);
      await createNote({
        documentId: document.id,
        title: title.trim() || canvas?.title || "Imported canvas",
        metadata: { page: 1, importedFromCanvas: canvasId },
        snapshot: getSnapshot(editor.store),
      });
      navigate(`/workspace/${document.id}`);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Could not attach the PDF",
      );
    } finally {
      setIsUploading(false);
      if (uploadInput.current) uploadInput.current.value = "";
    }
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
            if (editor) void saveCanvas(editor);
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
          onClick={() => {
            if (editor) void saveCanvas(editor);
          }}
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
        <button
          type="button"
          disabled={!editor || isUploading}
          onClick={() => uploadInput.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-300"
        >
          <FileUp size={16} />
          {isUploading ? "Attaching…" : "Attach PDF"}
        </button>
        <input
          ref={uploadInput}
          hidden
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => void attachPdf(event.target.files?.[0])}
        />
      </header>
      {uploadError && (
        <div className="absolute right-4 top-16 z-50 rounded-lg border border-red-400/20 bg-red-950/90 px-3 py-2 text-xs text-red-200 shadow-xl">
          {uploadError}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(360px,24rem)]">
        <NotesCanvas
          note={note}
          embedded
          onEditorReady={connectEditor}
          onTextSelected={(text) => {
            setSelectedText(text);
            setSelectedTexts(text ? [text] : undefined);
            setExistingExplanation(undefined);
            setSelectionAnchors(undefined);
          }}
          onCanvasSelection={(selection) => {
            setSelectedText(selection.text);
            setSelectedTexts(selection.texts);
            setSelectionImage(selection.imageDataUrl);
            setExistingExplanation(selection.existingExplanation);
            setSelectionAnchors(selection.anchors);
          }}
        />
        <aside className="overflow-auto border-l p-3">
          <ExplainPanel
            selectedText={selectedText}
            selectedTexts={selectedTexts}
            selectionImage={selectionImage}
            existingExplanation={existingExplanation}
            selectionAnchors={selectionAnchors}
            canvasId={canvasId}
            pageNumber={null}
            documentTitle={title.trim() || "Independent canvas"}
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
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Select text or hand-drawn mathematics to solve and explain it
            live. Graphable equations are plotted back onto the canvas.
          </p>
        </aside>
      </div>
    </main>
  );
}
