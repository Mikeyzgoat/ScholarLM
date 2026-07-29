import { useEffect, useRef, useState } from "react";
import {
  Highlighter,
  NotebookPen,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs" with { type: "file" };
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PDFToolbar } from "./PDFToolbar";
import { explainText } from "../../services/explanation";
import { cleanExplanation } from "../../lib/plainExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { AudioControls } from "../explanation/AudioControls";
import { HighlightedSpeechText } from "../explanation/ExplanationContent";
import { AnimatePresence, motion } from "framer-motion";
import { registerGeneratedOutput } from "../../lib/generatedOutputs";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PageHighlight {
  id: string;
  pageNumber: number;
  text: string;
  rectangles: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
}

interface CachedExplanation {
  positionKey: string;
  selection: PageHighlight;
  text: string;
  mode?: "explain" | "regenerate" | "simplify";
}

function selectionPositionKey(selection: PageHighlight): string {
  const rectangles = selection.rectangles
    .map((item) =>
      [item.left, item.top, item.width, item.height]
        .map((value) => value.toFixed(2))
        .join(","),
    )
    .join("|");
  return `${selection.pageNumber}:${selection.text}:${rectangles}`;
}

function explanationPosition(selection: PageHighlight) {
  const left = Math.min(
    62,
    Math.max(2, Math.min(...selection.rectangles.map((item) => item.left))),
  );
  const top =
    Math.max(
      ...selection.rectangles.map((item) => item.top + item.height),
    ) + 1;
  return {
    left: `${left}%`,
    top: `${top}%`,
  };
}

export function PDFViewer({
  fileUrl,
  documentTitle,
  activePage,
  onPageChange,
  onTextSelected,
  onRegionAddedToNotes,
  onExplanationGenerated,
}: {
  fileUrl: string;
  documentTitle: string;
  activePage: number;
  onPageChange: (p: number) => void;
  onTextSelected: (i: { text: string; pageNumber: number }) => void;
  onRegionAddedToNotes?: (region: {
    id: string;
    text: string;
    pageNumber: number;
  }) => void;
  onExplanationGenerated?: (input: {
    selectedText: string;
    explanation: string;
    pageNumber: number;
    mode?: "explain" | "regenerate" | "simplify";
  }) => void;
}) {
  const speech = useSpeech();
  const [count, setCount] = useState(0),
    [zoom, setZoom] = useState(1),
    [highlights, setHighlights] = useState<PageHighlight[]>([]),
    [cachedExplanations, setCachedExplanations] = useState<
      CachedExplanation[]
    >([]),
    [pending, setPending] = useState<PageHighlight | null>(null),
    [inlineExplanation, setInlineExplanation] = useState<{
      selection: PageHighlight;
      text: string;
      mode?: "explain" | "regenerate" | "simplify";
      error: string;
      loading: boolean;
    } | null>(null),
    [pdfUrl, setPdfUrl] = useState(""),
    [pdfError, setPdfError] = useState("");
  const pageContainer = useRef<HTMLDivElement>(null);
  const explanationGeneration = useRef(0);
  const storageKey = `scholarlm-pdf-highlights:${fileUrl}`;
  const explanationStorageKey = `scholarlm-pdf-explanations:${fileUrl}`;

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      if (Array.isArray(stored)) setHighlights(stored as PageHighlight[]);
    } catch {
      setHighlights([]);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(explanationStorageKey) ?? "[]",
      );
      setCachedExplanations(
        Array.isArray(stored) ? (stored as CachedExplanation[]) : [],
      );
    } catch {
      setCachedExplanations([]);
    }
  }, [explanationStorageKey]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setPdfUrl("");
    setPdfError("");
    void fetch(fileUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`PDF request failed (${response.status})`);
        objectUrl = URL.createObjectURL(await response.blob());
        setPdfUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setPdfError(
            error instanceof Error ? error.message : "Unable to load this PDF",
          );
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);

  function persist(next: PageHighlight[]) {
    setHighlights(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function captureSelection(event: React.MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-scholar-generated-output]")
    )
      return;
    const selection = getSelection();
    const selectionElement =
      selection?.anchorNode instanceof Element
        ? selection.anchorNode
        : selection?.anchorNode?.parentElement;
    if (selectionElement?.closest("[data-scholar-generated-output]")) return;
    const text = selection?.toString().trim();
    const page = pageContainer.current?.querySelector(".react-pdf__Page");
    if (!selection || !text || !page || selection.rangeCount === 0) return;
    const pageRect = page.getBoundingClientRect();
    const rectangles = Array.from(selection.getRangeAt(0).getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map((rect) => ({
        left: ((rect.left - pageRect.left) / pageRect.width) * 100,
        top: ((rect.top - pageRect.top) / pageRect.height) * 100,
        width: (rect.width / pageRect.width) * 100,
        height: (rect.height / pageRect.height) * 100,
      }));
    if (!rectangles.length) return;
    setPending({
      id: crypto.randomUUID(),
      pageNumber: activePage,
      text,
      rectangles,
    });
  }

  function persistExplanation(value: CachedExplanation) {
    registerGeneratedOutput({
      text: value.text,
      sourceText: value.selection.text,
      pageNumber: value.selection.pageNumber,
    });
    const next = [
      value,
      ...cachedExplanations.filter(
        (item) => item.positionKey !== value.positionKey,
      ),
    ].slice(0, 100);
    setCachedExplanations(next);
    localStorage.setItem(explanationStorageKey, JSON.stringify(next));
  }

  async function explainSelection(
    selection: PageHighlight,
    force = false,
    mode: "explain" | "regenerate" | "simplify" = "explain",
  ) {
    const generation = ++explanationGeneration.current;
    speech.stop();
    onTextSelected({
      text: selection.text,
      pageNumber: selection.pageNumber,
    });
    const positionKey = selectionPositionKey(selection);
    const cached = cachedExplanations.find(
      (item) => item.positionKey === positionKey,
    );
    if (cached && !force) {
      setInlineExplanation({
        selection,
        text: cached.text,
        error: "",
        loading: false,
      });
      await speech.speak(cached.text, selection.text);
      return;
    }
    setInlineExplanation({
      selection,
      text: "",
      error: "",
      loading: true,
    });
    try {
      let streamedText = "";
      const response = await explainText({
        selectedText: selection.text,
        documentTitle,
        pageNumber: selection.pageNumber,
        mode,
        previousExplanation:
          mode === "explain"
            ? undefined
            : cached?.text || inlineExplanation?.text || undefined,
        onToken: (token) => {
          if (generation !== explanationGeneration.current) return;
          streamedText += token;
          setInlineExplanation({
            selection,
            text: streamedText,
            mode,
            error: "",
            loading: true,
          });
        },
      });
      const explanation = cleanExplanation(response.explanation);
      if (generation !== explanationGeneration.current) return;
      setInlineExplanation({
        selection,
        text: explanation,
        mode,
        error: "",
        loading: false,
      });
      persistExplanation({
        positionKey,
        selection,
        text: explanation,
      });
      onExplanationGenerated?.({
        selectedText: selection.text,
        explanation,
        pageNumber: selection.pageNumber,
        mode,
      });
      await speech.speak(explanation, selection.text);
    } catch (error) {
      if (generation !== explanationGeneration.current) return;
      setInlineExplanation({
        selection,
        text: "",
        error:
          error instanceof Error ? error.message : "Unable to explain selection",
        loading: false,
      });
    }
  }

  function explainPending() {
    if (!pending) return;
    const selection = pending;
    addSelectionToNotes(selection);
    setPending(null);
    getSelection()?.removeAllRanges();
    void explainSelection(selection);
  }

  function addSelectionToNotes(selection: PageHighlight) {
    if (!highlights.some((item) => item.id === selection.id))
      persist([...highlights, selection]);
    onTextSelected({
      text: selection.text,
      pageNumber: selection.pageNumber,
    });
    onRegionAddedToNotes?.({
      id: selectionPositionKey(selection),
      text: selection.text,
      pageNumber: selection.pageNumber,
    });
  }

  function addPendingToNotes() {
    if (!pending) return;
    addSelectionToNotes(pending);
    setPending(null);
    getSelection()?.removeAllRanges();
  }

  function highlightPending() {
    if (!pending) return;
    persist([...highlights, pending]);
    setPending(null);
    getSelection()?.removeAllRanges();
  }

  return (
    <section className="relative flex h-full min-h-[620px] flex-col overflow-hidden rounded-lg border bg-stone-200">
      <PDFToolbar
        page={activePage}
        pageCount={count}
        zoom={zoom}
        onPreviousPage={() => onPageChange(Math.max(1, activePage - 1))}
        onNextPage={() => onPageChange(Math.min(count, activePage + 1))}
        onPageChange={(p) => onPageChange(Math.min(count, Math.max(1, p)))}
        onZoomIn={() => setZoom((z) => Math.min(2.5, z + 0.15))}
        onZoomOut={() => setZoom((z) => Math.max(0.5, z - 0.15))}
      />
      <div
        ref={pageContainer}
        className="flex flex-1 justify-center overflow-auto p-5"
        onMouseUp={captureSelection}
      >
        <div className="relative">
          {pdfError ? (
            <p className="p-6 text-red-700">{pdfError}</p>
          ) : !pdfUrl ? (
            <p className="p-6">Loading PDF…</p>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={(p) => setCount(p.numPages)}
              onLoadError={(error) => setPdfError(error.message)}
              loading={<p className="p-6">Rendering PDF…</p>}
              error={
                <p className="p-6 text-red-700">Unable to render this PDF.</p>
              }
            >
              <Page pageNumber={activePage} scale={zoom} />
            </Document>
          )}
          <div className="pointer-events-none absolute inset-0 z-10">
            {highlights
              .filter((highlight) => highlight.pageNumber === activePage)
              .flatMap((highlight) =>
                highlight.rectangles.map((rectangle, index) => (
                  <span
                    key={`${highlight.id}:${index}`}
                    title={highlight.text}
                    className="absolute rounded-sm bg-orange-400/30 mix-blend-multiply"
                    style={{
                      left: `${rectangle.left}%`,
                      top: `${rectangle.top}%`,
                      width: `${rectangle.width}%`,
                      height: `${rectangle.height}%`,
                    }}
                  />
                )),
              )}
          </div>
          <AnimatePresence>
            {inlineExplanation?.selection.pageNumber === activePage && (
            <motion.aside
              data-scholar-generated-output="explanation"
              onMouseUp={(event) => event.stopPropagation()}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="absolute z-30 w-80 max-w-[92%] rounded-xl border border-orange-400/25 bg-neutral-950/80 p-3 text-left shadow-[0_18px_60px_rgba(0,0,0,0.55),0_0_30px_rgba(249,115,22,0.12)] backdrop-blur-2xl"
              style={explanationPosition(inlineExplanation.selection)}
            >
              {!inlineExplanation.loading && (
                <button
                  type="button"
                  aria-label="Retry explanation"
                  title="Generate a new explanation"
                  onClick={() =>
                    void explainSelection(
                      inlineExplanation.selection,
                      true,
                      "regenerate",
                    )
                  }
                  className="absolute right-14 top-1 rounded p-1 text-stone-500 transition hover:bg-white/5 hover:text-orange-300"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              {!inlineExplanation.loading && (
                <button
                  type="button"
                  aria-label="Simplify explanation"
                  title="Generate a simpler explanation"
                  onClick={() =>
                    void explainSelection(
                      inlineExplanation.selection,
                      true,
                      "simplify",
                    )
                  }
                  className="absolute right-8 top-1 rounded p-1 text-stone-500 transition hover:bg-white/5 hover:text-purple-300"
                >
                  <Sparkles size={13} />
                </button>
              )}
              <button
                type="button"
                aria-label="Close explanation"
                onClick={() => {
                  speech.stop();
                  setInlineExplanation(null);
                }}
                className="absolute right-2 top-1 text-stone-500 hover:text-stone-200"
              >
                ×
              </button>
              <p className="pr-5 font-mono text-[10px] uppercase tracking-[0.16em] text-orange-400">
                Selected explanation
              </p>
              {inlineExplanation.loading && !inlineExplanation.text ? (
                <p className="mt-2 text-xs text-stone-400">
                  Routing the fastest answer…
                </p>
              ) : inlineExplanation.error ? (
                <p className="mt-2 text-xs leading-5 text-red-400">
                  {inlineExplanation.error}
                </p>
              ) : (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-stone-200">
                    <HighlightedSpeechText
                      text={inlineExplanation.text}
                      activeWordIndex={speech.activeWordIndex}
                    />
                    {inlineExplanation.loading && (
                      <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-orange-400 align-middle" />
                    )}
                  </p>
                  {!inlineExplanation.loading && <AudioControls
                    isLoading={speech.isLoading}
                    isPlaying={speech.isPlaying}
                    isPaused={speech.isPaused}
                    isReady={speech.isReady}
                    usingFallback={speech.usingFallback}
                    autoRead={speech.autoRead}
                    onPause={speech.pause}
                    onResume={speech.resume}
                    onReplay={speech.replay}
                    onStop={speech.stop}
                    onAutoReadChange={speech.setAutoRead}
                  />}
                  {speech.error && (
                    <p className="mt-2 text-xs text-red-400">
                      {speech.error.message}
                    </p>
                  )}
                </>
              )}
            </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {pending && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/15 bg-neutral-950/65 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.55),0_0_32px_rgba(249,115,22,0.16)] backdrop-blur-2xl"
        >
          <motion.button
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => void explainPending()}
            className="flex items-center gap-2 rounded-xl border border-orange-400/15 bg-orange-500/10 px-3 py-2 text-xs text-orange-200 transition hover:bg-orange-500/20"
          >
            <Sparkles size={15} />
            Add &amp; explain
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={addPendingToNotes}
            className="flex items-center gap-2 rounded-xl border border-teal-400/15 bg-teal-500/10 px-3 py-2 text-xs text-teal-200 transition hover:bg-teal-500/20"
          >
            <NotebookPen size={15} />
            Add to notes
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={highlightPending}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-stone-300 transition hover:bg-white/10"
          >
            <Highlighter size={15} />
            Highlight
          </motion.button>
          <motion.button
            whileHover={{ rotate: 4, scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            aria-label="Dismiss selection"
            onClick={() => setPending(null)}
            className="rounded-xl px-2 py-2 text-stone-500 transition hover:bg-white/10 hover:text-stone-200"
          >
            ×
          </motion.button>
        </motion.div>
        )}
      </AnimatePresence>
      {!!highlights.length && (
        <button
          onClick={() => persist([])}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-lg border bg-neutral-950/80 px-2 py-1.5 text-xs text-stone-500"
        >
          <Trash2 size={13} />
          Clear highlights
        </button>
      )}
    </section>
  );
}
