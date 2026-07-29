import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShape,
  type TLShapeId,
} from "tldraw";
import type { MathPlot } from "./types";

function sourceFingerprint(editor: Editor, sourceShapeIds: string[]): string {
  return sourceShapeIds
    .map((id) => editor.getShape(id as TLShapeId))
    .filter((shape) => shape !== undefined)
    .map((shape) => JSON.stringify([shape.id, shape.type, shape.props]))
    .sort()
    .join("\u001e");
}

export function removeInvalidatedMathGraphs(editor: Editor): void {
  const groups = new Map<string, TLShape[]>();
  const graphShapes = editor.getCurrentPageShapes().filter((shape) => {
    const meta = shape.meta as Record<string, unknown>;
    return (
      meta.scholarLmGenerated === true &&
      meta.scholarLmOutputKind === "math-graph"
    );
  });
  graphShapes.forEach((shape) => {
    const meta = shape.meta as Record<string, unknown>;
    const key = meta.scholarLmGraphSourceKey;
    if (typeof key !== "string") return;
    groups.set(key, [...(groups.get(key) ?? []), shape]);
  });
  groups.forEach((shapes) => {
    const meta = shapes[0].meta as Record<string, unknown>;
    const sourceShapeIds = Array.isArray(
      meta.scholarLmGraphSourceShapeIds,
    )
      ? meta.scholarLmGraphSourceShapeIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    if (!sourceShapeIds.length) return;
    const stored = meta.scholarLmGraphSourceFingerprint;
    if (
      typeof stored !== "string" ||
      sourceFingerprint(editor, sourceShapeIds) !== stored
    )
      editor.deleteShapes(shapes.map((shape) => shape.id));
  });
}

export function drawMathPlot(
  editor: Editor,
  plot: MathPlot,
  equation?: string,
  sourceShapeIds: string[] = [],
): void {
  if (plot.points.length < 2) return;
  const graphSourceKey = sourceShapeIds.length
    ? [...sourceShapeIds].sort().join("|")
    : `equation:${equation ?? plot.title}`;
  const graphMeta = {
    scholarLmGenerated: true,
    scholarLmOutputKind: "math-graph",
    scholarLmGraphSourceKey: graphSourceKey,
    scholarLmGraphSourceShapeIds: sourceShapeIds,
    scholarLmGraphSourceFingerprint: sourceFingerprint(
      editor,
      sourceShapeIds,
    ),
    scholarLmEquation: equation ?? plot.title,
  };
  const existingGraphShapes = editor
    .getCurrentPageShapes()
    .filter(
      (shape) =>
        (shape.meta as Record<string, unknown>).scholarLmGraphSourceKey ===
        graphSourceKey,
    );
  const createdShapeIds: TLShapeId[] = [];
  const bounds = editor.getSelectionPageBounds();
  const originX = (bounds?.maxX ?? editor.getViewportPageBounds().center.x) + 80;
  const originY = bounds?.minY ?? editor.getViewportPageBounds().center.y - 140;
  const width = 420;
  const height = 260;
  const xs = plot.points.map((point) => point.x);
  const ys = plot.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const mapPoint = (point: { x: number; y: number }) => ({
    x: originX + ((point.x - minX) / xRange) * width,
    y: originY + height - ((point.y - minY) / yRange) * height,
  });
  const segment = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: "orange" | "blue" | "grey",
    thickness: number,
  ) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const id = createShapeId();
    editor.createShape({
      id,
      type: "geo",
      x: x1,
      y: y1,
      rotation: Math.atan2(y2 - y1, x2 - x1),
      meta: graphMeta,
      props: {
        geo: "rectangle",
        w: Math.max(length, 1),
        h: thickness,
        color,
        fill: "solid",
        dash: "solid",
      },
    });
    createdShapeIds.push(id);
  };
  const xAxisY =
    originY + height - ((Math.min(Math.max(0, minY), maxY) - minY) / yRange) * height;
  const yAxisX =
    originX + ((Math.min(Math.max(0, minX), maxX) - minX) / xRange) * width;
  editor.run(() => {
    if (existingGraphShapes.length)
      editor.deleteShapes(existingGraphShapes.map((shape) => shape.id));
    const plotColor =
      document.documentElement.dataset.theme === "light" ? "blue" : "orange";
    segment(originX, xAxisY, originX + width, xAxisY, "grey", 2);
    segment(yAxisX, originY, yAxisX, originY + height, "grey", 2);
    (plot.segments?.length ? plot.segments : [plot.points]).forEach(
      (plotSegment) => {
        for (let index = 1; index < plotSegment.length; index += 1) {
          const previous = mapPoint(plotSegment[index - 1]);
          const current = mapPoint(plotSegment[index]);
          segment(previous.x, previous.y, current.x, current.y, plotColor, 4);
        }
      },
    );
    const titleId = createShapeId();
    editor.createShape({
      id: titleId,
      type: "text",
      x: originX,
      y: originY - 48,
      meta: graphMeta,
      props: {
        richText: toRichText(
          `${plot.title}${equation ? `  •  ${equation}` : ""}`,
        ),
        color: "black",
        size: "m",
      },
    });
    createdShapeIds.push(titleId);
    const xLabelId = createShapeId();
    editor.createShape({
      id: xLabelId,
      type: "text",
      x: originX + width + 10,
      y: xAxisY - 12,
      meta: graphMeta,
      props: { richText: toRichText(plot.xLabel), size: "s" },
    });
    createdShapeIds.push(xLabelId);
    const yLabelId = createShapeId();
    editor.createShape({
      id: yLabelId,
      type: "text",
      x: yAxisX + 8,
      y: originY - 24,
      meta: graphMeta,
      props: { richText: toRichText(plot.yLabel), size: "s" },
    });
    createdShapeIds.push(yLabelId);
    const groupId = createShapeId();
    editor.groupShapes(createdShapeIds, { groupId, select: true });
    editor.updateShape({
      id: groupId,
      type: "group",
      meta: graphMeta,
    });
  });
}
