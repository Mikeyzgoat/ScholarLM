import { useCallback, useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { GraphNode, GraphResponse } from "../../lib/types";
import { GraphControls } from "./GraphControls";
import graphHub from "../../assets/graph-hub.png";
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
    model = useRef<Graph | null>(null),
    physicsFrame = useRef(0);
  const runPhysics = useCallback((steps = 72) => {
    cancelAnimationFrame(physicsFrame.current);
    let remaining = steps;
    const tick = () => {
      const activeGraph = model.current;
      const activeRenderer = renderer.current;
      if (!activeGraph?.order || !activeRenderer || remaining <= 0) return;
      forceAtlas2.assign(activeGraph, {
        iterations: Math.min(2, remaining),
        settings: {
          ...forceAtlas2.inferSettings(activeGraph),
          gravity: 0.9,
          scalingRatio: 2.4,
          slowDown: 5,
        },
      });
      remaining -= 2;
      activeRenderer.refresh();
      if (remaining > 0)
        physicsFrame.current = requestAnimationFrame(tick);
    };
    physicsFrame.current = requestAnimationFrame(tick);
  }, []);
  const layout = useCallback(() => runPhysics(90), [runPhysics]);
  useEffect(() => {
    if (!container.current || !graph?.nodes.length) return;
    const g = new Graph({ multi: true });
    graph.nodes.forEach((n, i) =>
      g.addNode(n.id, {
        label: n.label,
        x: n.kind === "hub" ? 0 : Math.cos(i) * 10,
        y: n.kind === "hub" ? 0 : Math.sin(i) * 10,
        size:
          n.kind === "hub"
            ? 15
            : n.kind === "source"
              ? 10
              : n.kind === "note"
                ? 6
                : 7,
        color:
          n.kind === "hub"
            ? "#f97316"
            : n.kind === "source"
              ? "#fb923c"
              : n.kind === "note"
                ? "#c084fc"
                : "#a8a29e",
        forceLabel: n.kind === "hub",
        fixed: n.kind === "hub",
      }),
    );
    graph.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target))
        g.addEdgeWithKey(e.id, e.source, e.target, {
          label: e.relationship,
          color: "#78350f",
          size: 1.4,
        });
    });
    model.current = g;
    const sigma = new Sigma(g, container.current, {
      renderEdgeLabels: false,
      labelColor: { color: "#d6d3d1" },
      labelFont: "ui-monospace, SFMono-Regular, Menlo, monospace",
      labelSize: 12,
      defaultEdgeColor: "#78350f",
      stagePadding: 60,
    });
    renderer.current = sigma;
    runPhysics();
    let draggedNode: string | null = null;
    sigma.on("clickNode", ({ node }) => {
      const found = graph.nodes.find((n) => n.id === node);
      if (found) onNodeSelect(found);
    });
    sigma.on("downNode", ({ node, event }) => {
      if (g.getNodeAttribute(node, "fixed")) return;
      draggedNode = node;
      g.setNodeAttribute(node, "highlighted", true);
      g.setNodeAttribute(node, "fixed", true);
      event.preventSigmaDefault();
    });
    sigma.getMouseCaptor().on("mousemovebody", (event) => {
      if (!draggedNode) return;
      const position = sigma.viewportToGraph({ x: event.x, y: event.y });
      g.mergeNodeAttributes(draggedNode, position);
      event.preventSigmaDefault();
      event.original.preventDefault();
      sigma.refresh();
    });
    sigma.getMouseCaptor().on("mouseup", () => {
      if (!draggedNode) return;
      g.setNodeAttribute(draggedNode, "highlighted", false);
      g.setNodeAttribute(draggedNode, "fixed", false);
      draggedNode = null;
      runPhysics(24);
    });
    return () => {
      cancelAnimationFrame(physicsFrame.current);
      sigma.kill();
      renderer.current = null;
      model.current = null;
    };
  }, [graph, onNodeSelect, runPhysics]);
  useEffect(() => {
    const g = model.current;
    const sigma = renderer.current;
    if (!g || !sigma || !focusedNodeId || !g.hasNode(focusedNodeId)) return;
    graph?.nodes.forEach((node) => {
      if (!g.hasNode(node.id)) return;
      const normalSize =
        node.kind === "hub"
          ? 15
          : node.kind === "source"
            ? 10
            : node.kind === "note"
              ? 6
              : 7;
      g.setNodeAttribute(
        node.id,
        "size",
        node.id === focusedNodeId ? normalSize + 5 : normalSize,
      );
      g.setNodeAttribute(
        node.id,
        "color",
        node.id === focusedNodeId
          ? "#fdba74"
          : node.kind === "hub"
            ? "#f97316"
            : node.kind === "source" || node.pageNumber
            ? "#fb923c"
              : node.kind === "note"
                ? "#c084fc"
                : "#a8a29e",
      );
    });
    const { x, y } = g.getNodeAttributes(focusedNodeId);
    sigma.getCamera().animate({ x, y, ratio: 0.18 }, { duration: 420 });
    sigma.refresh();
  }, [focusedNodeId, graph]);
  if (isLoading) return <p className="text-sm">Loading graph…</p>;
  if (!graph?.nodes.length)
    return <p className="text-sm text-stone-500">No graph nodes were found.</p>;
  return (
    <div
      className={`relative overflow-hidden bg-[radial-gradient(circle_at_50%_48%,rgba(249,115,22,0.12),transparent_32%)] ${className ?? "h-72"}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,rgba(251,146,60,0.7)_1px,transparent_1px)] [background-size:24px_24px]" />
      {graph.nodes.some((node) => node.kind === "hub") && (
        <img
          src={graphHub}
          alt=""
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover shadow-[0_0_34px_rgba(249,115,22,0.42)] motion-safe:animate-pulse"
        />
      )}
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
