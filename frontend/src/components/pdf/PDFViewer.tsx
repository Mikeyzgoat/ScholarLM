import { useEffect, useRef, useState } from "react";
import { Highlighter, Sparkles, Trash2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs" with { type: "file" };
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PDFToolbar } from "./PDFToolbar";
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

export function PDFViewer({
  fileUrl,
  activePage,
  onPageChange,
  onTextSelected,
}: {
  fileUrl: string;
  activePage: number;
  onPageChange: (p: number) => void;
  onTextSelected: (i: { text: string; pageNumber: number }) => void;
}) {
  const [count, setCount] = useState(0),
    [zoom, setZoom] = useState(1),
    [highlights, setHighlights] = useState<PageHighlight[]>([]),
    [pending, setPending] = useState<PageHighlight | null>(null);
  const pageContainer = useRef<HTMLDivElement>(null);
  const storageKey = `scholarlm-pdf-highlights:${fileUrl}`;

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

  function persist(next: PageHighlight[]) {
    setHighlights(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function captureSelection() {
    const selection = getSelection();
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

  function explainPending() {
    if (!pending) return;
    onTextSelected({ text: pending.text, pageNumber: pending.pageNumber });
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
          <Document
            file={fileUrl}
            onLoadSuccess={(p) => setCount(p.numPages)}
            loading={<p>Loading PDF…</p>}
            error={<p className="text-red-700">Unable to load this PDF.</p>}
          >
            <Page pageNumber={activePage} scale={zoom} />
          </Document>
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
        </div>
      </div>
      {pending && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-neutral-950/90 p-1.5 shadow-2xl backdrop-blur-xl">
          <button
            onClick={explainPending}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-orange-300 hover:bg-orange-500/10"
          >
            <Sparkles size={15} />
            Select &amp; explain
          </button>
          <button
            onClick={highlightPending}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-white/5"
          >
            <Highlighter size={15} />
            Highlight
          </button>
          <button
            aria-label="Dismiss selection"
            onClick={() => setPending(null)}
            className="rounded-lg px-2 py-2 text-stone-500 hover:bg-white/5"
          >
            ×
          </button>
        </div>
      )}
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
