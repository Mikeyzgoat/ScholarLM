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
  const page = input.pageNumber ? `Page ${input.pageNumber}\n` : "";
  editor.createShape({
    type: "text",
    x: viewport.center.x - 210,
    y: viewport.center.y - 80,
    props: {
      richText: toRichText(
        `${page}Selected: ${input.selectedText}\n\n${input.explanation}`,
      ),
      color: "orange",
      size: "m",
      autoSize: false,
      w: 420,
    },
  });
}
