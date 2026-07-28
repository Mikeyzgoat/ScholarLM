import { toRichText, type Editor } from "tldraw";
import {
  generatedOutputKey,
  registerGeneratedOutput,
} from "./generatedOutputs";

export function addExplanationToCanvas(
  editor: Editor,
  input: {
    selectedText: string;
    explanation: string;
    pageNumber?: number;
    mode?: "explain" | "regenerate" | "simplify";
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
    mode: input.mode,
  });
  const sourceKey = generatedOutputKey(
    `${input.pageNumber ?? "canvas"}:${input.selectedText.trim().replace(/\s+/g, " ")}`,
  );
  const richText = toRichText(
    `${heading}\n${compactInput}\n\nExplanation\n${input.explanation}`,
  );
  const existing = editor.getCurrentPageShapes().find((shape) => {
    const meta = shape.meta as Record<string, unknown>;
    return meta.scholarLmSourceKey === sourceKey;
  });
  const meta = {
    scholarLmGenerated: true,
    scholarLmOutputKind: "explanation",
    scholarLmOutputId: output.id,
    scholarLmSourceKey: sourceKey,
  };
  if (existing?.type === "text") {
    editor.updateShape({
      id: existing.id,
      type: "text",
      meta,
      props: { richText },
    });
    return;
  }
  const selectionBounds = editor.getSelectionPageBounds();
  const width = 420;
  const estimatedHeight = Math.min(
    420,
    Math.max(160, 110 + Math.ceil(input.explanation.length / 52) * 22),
  );
  let x = selectionBounds
    ? selectionBounds.x
    : viewport.center.x - width / 2;
  let y = selectionBounds
    ? selectionBounds.maxY + 32
    : viewport.center.y + 48;
  const otherBounds = editor
    .getCurrentPageShapes()
    .filter((shape) => !editor.getSelectedShapeIds().includes(shape.id))
    .map((shape) => editor.getShapePageBounds(shape))
    .filter((bounds) => bounds !== undefined);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const collision = otherBounds.find(
      (bounds) =>
        x < bounds.maxX &&
        x + width > bounds.x &&
        y < bounds.maxY &&
        y + estimatedHeight > bounds.y,
    );
    if (!collision) break;
    y = collision.maxY + 28;
  }
  x = Math.max(viewport.x + 24, Math.min(x, viewport.maxX - width - 24));
  editor.createShape({
    type: "text",
    x,
    y,
    meta,
    props: {
      richText,
      color: "orange",
      font: "sans",
      size: "m",
      autoSize: false,
      w: 420,
    },
  });
}
