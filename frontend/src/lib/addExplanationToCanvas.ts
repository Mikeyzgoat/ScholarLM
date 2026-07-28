import { toRichText, type Editor } from "tldraw";
import { registerGeneratedOutput } from "./generatedOutputs";

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
    ? `From selection · Page ${input.pageNumber}`
    : "From canvas selection";
  const compactInput =
    input.selectedText.length > 220
      ? `${input.selectedText.slice(0, 217)}…`
      : input.selectedText;
  const output = registerGeneratedOutput({
    text: input.explanation,
    sourceText: input.selectedText,
    pageNumber: input.pageNumber,
  });
  editor.createShape({
    type: "text",
    x: viewport.center.x - 210,
    y: viewport.center.y - 80,
    meta: {
      scholarLmGenerated: true,
      scholarLmOutputKind: "explanation",
      scholarLmOutputId: output.id,
    },
    props: {
      richText: toRichText(
        `${heading}\n${compactInput}\n\nExplanation\n${input.explanation}`,
      ),
      color: "orange",
      font: "sans",
      size: "m",
      autoSize: false,
      w: 420,
    },
  });
}
