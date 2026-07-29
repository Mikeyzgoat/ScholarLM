import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs" with { type: "file" };
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const PDF_PAGE_SHAPE_TYPE = "scholar-pdf-page" as const;

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    [PDF_PAGE_SHAPE_TYPE]: {
      w: number;
      h: number;
      fileUrl: string;
      pageNumber: number;
      textSelectionEnabled: boolean;
    };
  }
}

export type PdfPageShape = TLShape<typeof PDF_PAGE_SHAPE_TYPE>;

function PdfPageContent({
  fileUrl,
  pageNumber,
  width,
  height,
  selectable,
}: {
  fileUrl: string;
  pageNumber: number;
  width: number;
  height: number;
  selectable: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadingTask = pdfjs.getDocument(fileUrl);
    let renderTask: RenderTask | undefined;
    let disposed = false;
    setError("");
    void loadingTask.promise
      .then((pdf) => pdf.getPage(pageNumber))
      .then((page) => {
        if (disposed || !canvas.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = width / baseViewport.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        target.style.width = `${width}px`;
        target.style.height = `${Math.min(height, viewport.height / pixelRatio)}px`;
        const context = target.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable");
        renderTask = page.render({ canvas: target, canvasContext: context, viewport });
        return renderTask.promise;
      })
      .catch((cause: unknown) => {
        if (
          disposed ||
          (cause instanceof Error && cause.name === "RenderingCancelledException")
        )
          return;
        console.error("Could not render the PDF page on the canvas", cause);
        setError("PDF preview could not be rendered. Reload the workspace to retry.");
      });
    return () => {
      disposed = true;
      renderTask?.cancel();
      void loadingTask.destroy();
    };
  }, [fileUrl, pageNumber, width, height]);

  return (
    <>
      <canvas ref={canvas} className="block bg-white" />
      {selectable && !error && (
        <div className="pdf-text-selection-layer absolute inset-0">
          <Document file={fileUrl} loading={null}>
            <Page
              pageNumber={pageNumber}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer
              loading={null}
            />
          </Document>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-red-700">
          {error}
        </div>
      )}
    </>
  );
}

export class PdfPageShapeUtil extends BaseBoxShapeUtil<PdfPageShape> {
  static override type = PDF_PAGE_SHAPE_TYPE;
  static override props: RecordProps<PdfPageShape> = {
    w: T.number,
    h: T.number,
    fileUrl: T.string,
    pageNumber: T.number,
    textSelectionEnabled: T.boolean,
  };

  override getDefaultProps(): PdfPageShape["props"] {
    return {
      w: 816,
      h: 1056,
      fileUrl: "",
      pageNumber: 1,
      textSelectionEnabled: false,
    };
  }

  override canResize() {
    return false;
  }

  override canEdit() {
    return false;
  }

  override isAspectRatioLocked() {
    return true;
  }

  override getGeometry(shape: PdfPageShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: PdfPageShape) {
    const selectable = shape.props.textSelectionEnabled;
    return (
      <HTMLContainer
        id={shape.id}
        className="overflow-hidden bg-white shadow-2xl"
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: selectable ? "all" : "none",
          userSelect: selectable ? "text" : "none",
        }}
        onPointerDown={
          selectable ? (event) => event.stopPropagation() : undefined
        }
        onPointerMove={
          selectable ? (event) => event.stopPropagation() : undefined
        }
        onPointerUp={
          selectable
            ? (event) => {
                event.stopPropagation();
                requestAnimationFrame(() => {
                  const text = getSelection()?.toString().trim() ?? "";
                  if (text)
                    window.dispatchEvent(
                      new CustomEvent("scholarlm:pdf-selection", {
                        detail: text,
                      }),
                    );
                });
              }
            : undefined
        }
      >
        <PdfPageContent
          fileUrl={shape.props.fileUrl}
          pageNumber={shape.props.pageNumber}
          width={shape.props.w}
          height={shape.props.h}
          selectable={selectable}
        />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: PdfPageShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

export const pdfPageShapeUtils = [PdfPageShapeUtil];
