import { toRichText, type Editor } from "tldraw";
import type { MathPlot } from "./types";

export function drawMathPlot(
  editor: Editor,
  plot: MathPlot,
  equation?: string,
): void {
  if (plot.points.length < 2) return;
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
    color: "orange" | "grey",
    thickness: number,
  ) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    editor.createShape({
      type: "geo",
      x: x1,
      y: y1,
      rotation: Math.atan2(y2 - y1, x2 - x1),
      props: {
        geo: "rectangle",
        w: Math.max(length, 1),
        h: thickness,
        color,
        fill: "solid",
        dash: "solid",
      },
    });
  };
  const xAxisY =
    originY + height - ((Math.min(Math.max(0, minY), maxY) - minY) / yRange) * height;
  const yAxisX =
    originX + ((Math.min(Math.max(0, minX), maxX) - minX) / xRange) * width;
  editor.run(() => {
    segment(originX, xAxisY, originX + width, xAxisY, "grey", 2);
    segment(yAxisX, originY, yAxisX, originY + height, "grey", 2);
    for (let index = 1; index < plot.points.length; index += 1) {
      const previous = mapPoint(plot.points[index - 1]);
      const current = mapPoint(plot.points[index]);
      segment(previous.x, previous.y, current.x, current.y, "orange", 4);
    }
    editor.createShape({
      type: "text",
      x: originX,
      y: originY - 48,
      props: {
        richText: toRichText(
          `${plot.title}${equation ? `  •  ${equation}` : ""}`,
        ),
        color: "orange",
        size: "m",
      },
    });
    editor.createShape({
      type: "text",
      x: originX + width + 10,
      y: xAxisY - 12,
      props: { richText: toRichText(plot.xLabel), size: "s" },
    });
    editor.createShape({
      type: "text",
      x: yAxisX + 8,
      y: originY - 24,
      props: { richText: toRichText(plot.yLabel), size: "s" },
    });
  });
}
