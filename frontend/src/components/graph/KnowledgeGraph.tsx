import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { GraphNode, GraphResponse } from "../../lib/types";
import { GraphControls } from "./GraphControls";
export function KnowledgeGraph({
  graph,
  isLoading,
  onNodeSelect,
  focusedNodeId,
  className,
}: {
  graph: GraphResponse | undefined;
  isLoading: boolean;
  onNodeSelect: (node: GraphNode) => void;
  focusedNodeId?: string | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    renderer = useRef<Sigma | null>(null),
    model = useRef<Graph | null>(null);
  function layout() {
    if (model.current?.order)
      forceAtlas2.assign(model.current, {
        iterations: 80,
        settings: forceAtlas2.inferSettings(model.current),
      });
    renderer.current?.refresh();
  }
  useEffect(() => {
    if (!container.current || !graph?.nodes.length) return;
    const g = new Graph({ multi: true });
    graph.nodes.forEach((n, i) =>
      g.addNode(n.id, {
        label: n.label,
        x: Math.cos(i) * 10,
        y: Math.sin(i) * 10,
        size: 7,
        color: n.pageNumber ? "#0f766e" : "#78716c",
      }),
    );
    graph.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target))
        g.addEdgeWithKey(e.id, e.source, e.target, {
          label: e.relationship,
          color: "#a8a29e",
          size: 1,
        });
    });
    model.current = g;
    layout();
    const sigma = new Sigma(g, container.current, { renderEdgeLabels: false });
    renderer.current = sigma;
    sigma.on("clickNode", ({ node }) => {
      const found = graph.nodes.find((n) => n.id === node);
      if (found) onNodeSelect(found);
    });
    return () => {
      sigma.kill();
      renderer.current = null;
      model.current = null;
    };
  }, [graph, onNodeSelect]);
  useEffect(() => {
    const g = model.current;
    const sigma = renderer.current;
    if (!g || !sigma || !focusedNodeId || !g.hasNode(focusedNodeId)) return;
    graph?.nodes.forEach((node) => {
      if (!g.hasNode(node.id)) return;
      g.setNodeAttribute(node.id, "size", node.id === focusedNodeId ? 13 : 7);
      g.setNodeAttribute(
        node.id,
        "color",
        node.id === focusedNodeId
          ? "#f97316"
          : node.pageNumber
            ? "#fb923c"
            : "#78716c",
      );
    });
    const { x, y } = g.getNodeAttributes(focusedNodeId);
    sigma.getCamera().animate({ x, y, ratio: 0.18 }, { duration: 420 });
    sigma.refresh();
  }, [focusedNodeId, graph]);
  if (isLoading) return <p className="text-sm">Loading graph…</p>;
  if (!graph?.nodes.length)
    return <p className="text-sm text-stone-500">No concepts were found.</p>;
  return (
    <div className={`relative ${className ?? "h-72"}`}>
      <GraphControls
        onZoomIn={() => renderer.current?.getCamera().animatedZoom()}
        onZoomOut={() => renderer.current?.getCamera().animatedUnzoom()}
        onReset={() => renderer.current?.getCamera().animatedReset()}
        onLayout={layout}
      />
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
