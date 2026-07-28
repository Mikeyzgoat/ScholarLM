import { toRichText, type Editor } from "tldraw";
import type { CanvasSelectionAnchor } from "./types";
import {
  generatedOutputKey,
  registerGeneratedOutput,
} from "./generatedOutputs";

interface ExplanationCanvasInput {
  selectedText: string;
  explanation: string;
  pageNumber?: number;
  mode?: "explain" | "regenerate" | "simplify";
  answers?: string[];
  anchors?: CanvasSelectionAnchor[];
}

function withoutAnswerPrefix(value: string): string {
  return value.replace(/^Answer\s+\d+\s*:\s*/i, "").trim();
}

export function addExplanationToCanvas(
  editor: Editor,
  input: ExplanationCanvasInput,
): void {
  const anchored =
    input.anchors?.length &&
    input.answers?.length === input.anchors.length
      ? input.anchors.map((anchor, index) => ({
          sourceText: anchor.text,
          explanation: withoutAnswerPrefix(input.answers![index]),
          anchor,
        }))
      : [
          {
            sourceText: input.selectedText,
            explanation: input.explanation,
            anchor: input.anchors?.[0],
          },
        ];

  anchored.forEach((item, index) =>
    upsertExplanationBlock(editor, {
      ...input,
      selectedText: item.sourceText,
      explanation: item.explanation,
      anchor: item.anchor,
      answerNumber: anchored.length > 1 ? index + 1 : undefined,
      compactWidth: anchored.length > 1 ? 380 : 420,
    }),
  );
}

function upsertExplanationBlock(
  editor: Editor,
  input: ExplanationCanvasInput & {
    anchor?: CanvasSelectionAnchor;
    answerNumber?: number;
    compactWidth: number;
  },
): void {
  const viewport = editor.getViewportPageBounds();
  const heading = input.pageNumber
    ? `From selection · Page ${input.pageNumber}`
    : input.answerNumber
      ? `From canvas selection · Answer ${input.answerNumber}`
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
    scholarLmSourceText: input.selectedText,
    scholarLmExplanation: input.explanation,
    scholarLmAnchorShapeId: input.anchor?.shapeId,
  };
  if (existing?.type === "text") {
    editor.updateShape({
      id: existing.id,
      type: "text",
      meta,
      props: { richText, color: "black" },
    });
    return;
  }

  const selectionBounds = editor.getSelectionPageBounds();
  const width = input.compactWidth;
  const estimatedHeight = Math.min(
    420,
    Math.max(160, 110 + Math.ceil(input.explanation.length / 48) * 22),
  );
  let x =
    input.anchor?.x ??
    selectionBounds?.x ??
    viewport.center.x - width / 2;
  let y =
    input.anchor
      ? input.anchor.y + input.anchor.height + 32
      : selectionBounds
        ? selectionBounds.maxY + 32
        : viewport.center.y + 48;
  const ignoredShapeIds = new Set([
    ...editor.getSelectedShapeIds(),
    ...(input.anchor ? [input.anchor.shapeId] : []),
  ]);
  const otherBounds = editor
    .getCurrentPageShapes()
    .filter((shape) => !ignoredShapeIds.has(shape.id))
    .map((shape) => editor.getShapePageBounds(shape))
    .filter((bounds) => bounds !== undefined);
  for (let attempt = 0; attempt < 16; attempt += 1) {
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
      color: "black",
      font: "sans",
      size: "m",
      autoSize: false,
      w: width,
    },
  });
}
