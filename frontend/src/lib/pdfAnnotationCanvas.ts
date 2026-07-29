import {
  PageRecordType,
  createShapeId,
  type Editor,
  type TLPageId,
} from "tldraw";
import {
  PDF_PAGE_SHAPE_TYPE,
  type PdfPageShape,
} from "../components/notes/PdfPageShape";

const pageName = (pageNumber: number) => `PDF · Page ${pageNumber}`;
const PDF_WIDTH = 816;
const PDF_HEIGHT = 1056;
const PDF_DEFAULT_ZOOM = 0.9;

export function focusPdfPage(editor: Editor): void {
  const viewport = editor.getViewportScreenBounds();
  editor.setCamera(
    {
      x: (viewport.width - PDF_WIDTH * PDF_DEFAULT_ZOOM) /
        2 /
        PDF_DEFAULT_ZOOM,
      y: (viewport.height - PDF_HEIGHT * PDF_DEFAULT_ZOOM) /
        2 /
        PDF_DEFAULT_ZOOM,
      z: PDF_DEFAULT_ZOOM,
    },
    { animation: { duration: 180 } },
  );
}

export function showPdfPageOnCanvas(input: {
  editor: Editor;
  documentId: string;
  fileUrl: string;
  pageNumber: number;
  textSelectionEnabled: boolean;
}): void {
  const { editor, documentId, fileUrl, pageNumber, textSelectionEnabled } =
    input;
  let page = editor.getPages().find((item) => item.name === pageName(pageNumber));
  if (!page && pageNumber === 1 && editor.getPages().length === 1) {
    page = editor.getPages()[0];
    editor.renamePage(page, pageName(pageNumber));
  }
  if (!page) {
    const id = PageRecordType.createId(
      `scholar-pdf-${documentId}-${pageNumber}`,
    );
    editor.createPage({ id, name: pageName(pageNumber) });
    page = editor.getPage(id);
  }
  if (!page) return;
  editor.setCurrentPage(page.id as TLPageId);

  const shapeId = createShapeId(`scholar-pdf-${documentId}-${pageNumber}`);
  const existing = editor.getShape<PdfPageShape>(shapeId);
  if (!existing) {
    editor.createShape<PdfPageShape>({
      id: shapeId,
      type: PDF_PAGE_SHAPE_TYPE,
      x: 0,
      y: 0,
      isLocked: false,
      props: {
        w: 816,
        h: 1056,
        fileUrl,
        pageNumber,
        textSelectionEnabled,
      },
    });
    editor.sendToBack([shapeId]);
    editor.updateShape<PdfPageShape>({
      id: shapeId,
      type: PDF_PAGE_SHAPE_TYPE,
      isLocked: true,
    });
    focusPdfPage(editor);
    return;
  }
  editor.updateShape<PdfPageShape>({
    id: shapeId,
    type: PDF_PAGE_SHAPE_TYPE,
    isLocked: false,
  });
  editor.sendToBack([shapeId]);
  if (existing.props.textSelectionEnabled !== textSelectionEnabled)
    editor.updateShape<PdfPageShape>({
      id: shapeId,
      type: PDF_PAGE_SHAPE_TYPE,
      props: { textSelectionEnabled },
    });
  editor.updateShape<PdfPageShape>({
    id: shapeId,
    type: PDF_PAGE_SHAPE_TYPE,
    isLocked: true,
  });
  focusPdfPage(editor);
}
