import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";
import { Document, Page, pdfjs } from "react-pdf";
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
        }}
        onPointerDown={
          selectable ? (event) => event.stopPropagation() : undefined
        }
        onPointerMove={
          selectable ? (event) => event.stopPropagation() : undefined
        }
        onPointerUp={
          selectable ? (event) => event.stopPropagation() : undefined
        }
      >
        <Document file={shape.props.fileUrl} loading={null}>
          <Page
            pageNumber={shape.props.pageNumber}
            width={shape.props.w}
            renderAnnotationLayer={false}
            renderTextLayer={selectable}
            loading={null}
          />
        </Document>
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
