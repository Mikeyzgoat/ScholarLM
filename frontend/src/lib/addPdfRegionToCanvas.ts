import { toRichText, type Editor } from "tldraw";

export interface PdfTextRegion {
  id: string;
  text: string;
  pageNumber: number;
}

export function addPdfRegionToCanvas(
  editor: Editor,
  region: PdfTextRegion,
): void {
  const existing = editor.getCurrentPageShapes().find(
    (shape) =>
      (shape.meta as Record<string, unknown>).scholarLmPdfRegionId ===
      region.id,
  );
  if (existing) {
    editor.select(existing.id);
    editor.zoomToSelection();
    return;
  }

  const viewport = editor.getViewportPageBounds();
  const width = 420;
  const compactText =
    region.text.length > 1800
      ? `${region.text.slice(0, 1797).trimEnd()}…`
      : region.text;
  editor.createShape({
    type: "text",
    x: viewport.center.x - width / 2,
    y: viewport.center.y - 90,
    meta: {
      scholarLmPdfRegion: true,
      scholarLmPdfRegionId: region.id,
      scholarLmSourceText: region.text,
      scholarLmSourcePage: region.pageNumber,
    },
    props: {
      richText: toRichText(
        `PDF selection · Page ${region.pageNumber}\n\n${compactText}`,
      ),
      color: "black",
      font: "sans",
      size: "m",
      autoSize: false,
      w: width,
    },
  });
}
