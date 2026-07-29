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
      isLocked: true,
      props: {
        w: 816,
        h: 1056,
        fileUrl,
        pageNumber,
        textSelectionEnabled,
      },
    });
    editor.sendToBack([shapeId]);
    editor.zoomToBounds(
      { x: 0, y: 0, w: 816, h: 1056 },
      { inset: 48, animation: { duration: 180 } },
    );
    return;
  }
  if (existing.props.textSelectionEnabled !== textSelectionEnabled)
    editor.updateShape<PdfPageShape>({
      id: shapeId,
      type: PDF_PAGE_SHAPE_TYPE,
      props: { textSelectionEnabled },
    });
}
