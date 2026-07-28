import { toRichText, type Editor } from "tldraw";

export function addExplanationToCanvas(
  editor: Editor,
  input: {
    selectedText: string;
    explanation: string;
    pageNumber?: number;
  },
): void {
  const viewport = editor.getViewportPageBounds();
  const heading = input.pageNumber
    ? `Explanation · Page ${input.pageNumber}\n\n`
    : "";
  editor.createShape({
    type: "text",
    x: viewport.center.x - 210,
    y: viewport.center.y - 80,
    props: {
      richText: toRichText(`${heading}${input.explanation}`),
      color: "orange",
      font: "sans",
      size: "m",
      autoSize: false,
      w: 420,
    },
  });
}
