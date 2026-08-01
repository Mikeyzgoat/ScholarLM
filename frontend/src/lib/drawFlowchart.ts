import { createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw";
import type { FlowchartDiagram } from "./types";

export function drawFlowchart(
  editor: Editor,
  chart: FlowchartDiagram,
  sourceShapeIds: string[] = [],
): void {
  if (chart.nodes.length < 2 || !chart.edges.length) return;
  const key = sourceShapeIds.length
    ? `flowchart:${[...sourceShapeIds].sort().join("|")}`
    : `flowchart:${chart.title}`;
  const meta = {
    scholarLmGenerated: true,
    scholarLmOutputKind: "flowchart",
    scholarLmGraphSourceKey: key,
    scholarLmGraphSourceShapeIds: sourceShapeIds,
  };
  const existing = editor.getCurrentPageShapes().filter(
    (shape) => (shape.meta as Record<string, unknown>).scholarLmGraphSourceKey === key,
  );
  const bounds = editor.getSelectionPageBounds();
  const originX = (bounds?.maxX ?? editor.getViewportPageBounds().center.x) + 80;
  const originY = bounds?.minY ?? editor.getViewportPageBounds().center.y - 160;
  const positions = new Map<string, { x: number; y: number }>();
  chart.nodes.forEach((node, index) => {
    positions.set(node.id, {
      x: originX + (index % 2) * 260,
      y: originY + Math.floor(index / 2) * 130,
    });
  });
  const ids: TLShapeId[] = [];
  editor.run(() => {
    if (existing.length) editor.deleteShapes(existing.map((shape) => shape.id));
    chart.edges.forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return;
      const x1 = from.x + 100;
      const y1 = from.y + 56;
      const x2 = to.x + 100;
      const y2 = to.y;
      const length = Math.hypot(x2 - x1, y2 - y1);
      const id = createShapeId();
      editor.createShape({
        id,
        type: "geo",
        x: x1,
        y: y1,
        rotation: Math.atan2(y2 - y1, x2 - x1),
        meta,
        props: { geo: "rectangle", w: Math.max(1, length), h: 3, color: "grey", fill: "solid", dash: "solid" },
      });
      ids.push(id);
    });
    chart.nodes.forEach((node) => {
      const position = positions.get(node.id)!;
      const id = createShapeId();
      editor.createShape({
        id,
        type: "geo",
        x: position.x,
        y: position.y,
        meta,
        props: { geo: "rectangle", w: 200, h: 56, color: "orange", fill: "semi", richText: toRichText(node.label) },
      });
      ids.push(id);
    });
    const titleId = createShapeId();
    editor.createShape({
      id: titleId,
      type: "text",
      x: originX,
      y: originY - 48,
      meta,
      props: { richText: toRichText(chart.title), color: "black", size: "m" },
    });
    ids.push(titleId);
    if (ids.length > 1) editor.groupShapes(ids, { groupId: createShapeId(), select: true });
  });
}
