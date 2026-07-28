import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs" with {
  type: "file",
};
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PDFToolbar } from "./PDFToolbar";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
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
    [zoom, setZoom] = useState(1);
  return (
    <section className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-lg border bg-stone-200">
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
        className="flex flex-1 justify-center overflow-auto p-5"
        onMouseUp={() => {
          const text = getSelection()?.toString().trim();
          if (text) onTextSelected({ text, pageNumber: activePage });
        }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={(p) => setCount(p.numPages)}
          loading={<p>Loading PDF…</p>}
          error={<p className="text-red-700">Unable to load this PDF.</p>}
        >
          <Page pageNumber={activePage} scale={zoom} />
        </Document>
      </div>
    </section>
  );
}
