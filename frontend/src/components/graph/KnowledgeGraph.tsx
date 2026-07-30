import { useCallback, useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { GraphNode, GraphResponse } from "../../lib/types";
import { GraphControls } from "./GraphControls";
import { useTheme } from "../../lib/theme";

function groupedPositions(
  graph: GraphResponse,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const hub = graph.nodes.find((node) => node.kind === "hub");
  const sources = graph.nodes.filter((node) => node.kind === "source");
  if (hub) positions.set(hub.id, { x: 0, y: 0 });
  sources.forEach((source, index) => {
    const angle = (index / Math.max(1, sources.length)) * Math.PI * 2;
    const radius = hub ? 7 : 0;
    positions.set(source.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
  const outgoing = new Map<string, string[]>();
  graph.edges.forEach((edge) => {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  });
  if (hub) {
    const localCanvases = (outgoing.get(hub.id) ?? [])
      .map((id) => nodeById.get(id))
      .filter(
        (node): node is GraphNode =>
          node?.kind === "note" && Boolean(node.canvasId),
      );
    localCanvases.forEach((node, index) => {
      const angle =
        (index / Math.max(1, localCanvases.length)) * Math.PI * 2 +
        Math.PI / 5;
      positions.set(node.id, {
        x: Math.cos(angle) * 3.6,
        y: Math.sin(angle) * 3.6,
      });
    });
  }
  sources.forEach((source) => {
    const origin = positions.get(source.id) ?? { x: 0, y: 0 };
    const directChildren = (outgoing.get(source.id) ?? [])
      .map((id) => nodeById.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    const children = [
      ...new Map(
        [
          ...directChildren,
          ...graph.nodes.filter(
            (node) =>
              node.kind === "concept" &&
              node.documentId === source.documentId,
          ),
        ].map((node) => [node.id, node]),
      ).values(),
    ];
    const concepts = children.filter((node) => node.kind === "concept");
    const notes = children.filter((node) => node.kind === "note");
    const handwriting = children.filter(
      (node) => node.kind === "handwriting",
    );
    concepts.forEach((node, index) => {
      const angle = (index / Math.max(1, concepts.length)) * Math.PI * 2;
      positions.set(node.id, {
        x: origin.x + Math.cos(angle) * 3.4,
        y: origin.y + Math.sin(angle) * 3.4,
      });
    });
    notes.forEach((node, index) => {
      const angle =
        (index / Math.max(1, notes.length)) * Math.PI * 2 + Math.PI / 4;
      positions.set(node.id, {
        x: origin.x + Math.cos(angle) * 2.2,
        y: origin.y + Math.sin(angle) * 2.2,
      });
    });
    handwriting.forEach((node, index) => {
      const angle =
        (index / Math.max(1, handwriting.length)) * Math.PI * 2 + Math.PI / 3;
      positions.set(node.id, {
        x: origin.x + Math.cos(angle) * 2.4,
        y: origin.y + Math.sin(angle) * 2.4,
      });
    });
  });
  graph.nodes
    .filter((node) => node.kind === "note")
    .forEach((note) => {
      const origin = positions.get(note.id) ?? { x: 0, y: 0 };
      const details = (outgoing.get(note.id) ?? [])
        .map((id) => nodeById.get(id))
        .filter(
          (node): node is GraphNode =>
            node?.kind === "sticky" || node?.kind === "handwriting",
        );
      details.forEach((detail, index) => {
        const angle =
          (index / Math.max(1, details.length)) * Math.PI * 2 + Math.PI / 6;
        positions.set(detail.id, {
          x: origin.x + Math.cos(angle) * 1.15,
          y: origin.y + Math.sin(angle) * 1.15,
        });
      });
    });
  graph.nodes.forEach((node, index) => {
    if (positions.has(node.id)) return;
    const angle = (index / Math.max(1, graph.nodes.length)) * Math.PI * 2;
    positions.set(node.id, {
      x: Math.cos(angle) * 4.5,
      y: Math.sin(angle) * 4.5,
    });
  });
  return positions;
}

function nodeSize(node: GraphNode): number {
  if (node.kind === "hub") return 15;
  if (node.kind === "source") return 10;
  if (node.kind === "note") return 6;
  if (node.kind === "sticky") return 4.5;
  if (node.kind === "handwriting") return 5;
  return 7;
}

function nodeColor(node: GraphNode, light: boolean): string {
  if (node.kind === "hub") return light ? "#149da5" : "#f97316";
  if (node.kind === "source" || node.kind === "concept")
    return light ? "#2378b5" : "#38bdf8";
  if (node.kind === "note") return light ? "#7c3aed" : "#c084fc";
  if (node.kind === "sticky") return light ? "#ca8a04" : "#facc15";
  if (node.kind === "handwriting") return light ? "#ea580c" : "#fb7185";
  return light ? "#64748b" : "#a8a29e";
}

function graphLabel(node: GraphNode): string {
  const label = node.label.trim();
  return label.length > 46 ? `${label.slice(0, 43)}…` : label;
}

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
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
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
          gravity: 1.05,
          scalingRatio: 2.15,
          slowDown: 7,
          edgeWeightInfluence: 1.2,
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
    const positions = groupedPositions(graph);
    graph.nodes.forEach((n, i) =>
      g.addNode(n.id, {
        label: graphLabel(n),
        x: positions.get(n.id)?.x ?? Math.cos(i) * 4,
        y: positions.get(n.id)?.y ?? Math.sin(i) * 4,
        size: nodeSize(n),
        color: nodeColor(n, light),
        forceLabel:
          n.kind === "hub" ||
          n.kind === "source",
        fixed: n.kind === "hub",
      }),
    );
    graph.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target))
        g.addEdgeWithKey(e.id, e.source, e.target, {
          label: e.relationship,
          color: light ? "#a7d8dc" : "#78350f",
          size: 1.4,
          weight:
            e.relationship === "explanation"
              ? 4
              : e.relationship === "handwriting"
                ? 4
              : e.relationship === "note"
                ? 3
                : e.relationship === "source"
                  ? 2
                  : 1.5,
        });
    });
    model.current = g;
    const sigma = new Sigma(g, container.current, {
      renderEdgeLabels: false,
      labelColor: { color: light ? "#26333c" : "#d6d3d1" },
      labelFont: "ui-monospace, SFMono-Regular, Menlo, monospace",
      labelSize: 11,
      labelDensity: 0.65,
      labelGridCellSize: 120,
      labelRenderedSizeThreshold: 6.5,
      defaultEdgeColor: light ? "#a7d8dc" : "#78350f",
      stagePadding: 60,
      allowInvalidContainer: true,
    });
    renderer.current = sigma;
    const resizeObserver = new ResizeObserver(() => {
      const bounds = container.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      sigma.resize();
      sigma.refresh();
    });
    resizeObserver.observe(container.current);
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
      resizeObserver.disconnect();
      cancelAnimationFrame(physicsFrame.current);
      sigma.kill();
      renderer.current = null;
      model.current = null;
    };
  }, [graph, onNodeSelect, runPhysics]);
  useEffect(() => {
    const g = model.current;
    const sigma = renderer.current;
    if (!g || !sigma || !graph) return;
    graph.nodes.forEach((node) => {
      if (g.hasNode(node.id))
        g.setNodeAttribute(node.id, "color", nodeColor(node, light));
    });
    g.forEachEdge((edge) => {
      g.setEdgeAttribute(edge, "color", light ? "#a7d8dc" : "#78350f");
    });
    sigma.setSetting("labelColor", {
      color: light ? "#26333c" : "#d6d3d1",
    });
    sigma.setSetting("defaultEdgeColor", light ? "#a7d8dc" : "#78350f");
    sigma.refresh();
  }, [graph, light]);
  useEffect(() => {
    const g = model.current;
    const sigma = renderer.current;
    if (!g || !sigma || !focusedNodeId || !g.hasNode(focusedNodeId)) return;
    graph?.nodes.forEach((node) => {
      if (!g.hasNode(node.id)) return;
      const normalSize = nodeSize(node);
      g.setNodeAttribute(
        node.id,
        "size",
        node.id === focusedNodeId ? normalSize + 5 : normalSize,
      );
      g.setNodeAttribute(
        node.id,
        "forceLabel",
        node.id === focusedNodeId ||
          node.kind === "hub" ||
          node.kind === "source",
      );
      g.setNodeAttribute(node.id, "color", nodeColor(node, light));
    });
    const { x, y } = g.getNodeAttributes(focusedNodeId);
    sigma.getCamera().animate({ x, y, ratio: 0.18 }, { duration: 420 });
    sigma.refresh();
  }, [focusedNodeId, graph, light]);
  if (isLoading) return <p className="text-sm">Loading graph…</p>;
  if (!graph?.nodes.length)
    return <p className="text-sm text-stone-500">No graph nodes were found.</p>;
  return (
    <div
      className={`relative overflow-hidden ${
        light
          ? "bg-[radial-gradient(circle_at_50%_48%,rgba(20,157,165,0.13),transparent_34%)]"
          : "bg-[radial-gradient(circle_at_50%_48%,rgba(249,115,22,0.12),transparent_32%)]"
      } ${className ?? "h-72"}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 opacity-[0.12] [background-size:24px_24px] ${
          light
            ? "[background-image:radial-gradient(circle,rgba(20,157,165,0.65)_1px,transparent_1px)]"
            : "[background-image:radial-gradient(circle,rgba(251,146,60,0.7)_1px,transparent_1px)]"
        }`}
      />
      <GraphControls
        onZoomIn={() => renderer.current?.getCamera().animatedZoom()}
        onZoomOut={() => renderer.current?.getCamera().animatedUnzoom()}
        onReset={() => renderer.current?.getCamera().animatedReset()}
        onLayout={layout}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-black/40 p-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] backdrop-blur-md">
        <span className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sky-300">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          PDF
        </span>
        <span className="flex items-center gap-1.5 rounded px-1.5 py-1 text-purple-300">
          <span className="h-2 w-2 rounded-full bg-purple-400" />
          Canvas
        </span>
        <span className="flex items-center gap-1.5 rounded px-1.5 py-1 text-amber-300">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Sticky
        </span>
        <span className="flex items-center gap-1.5 rounded px-1.5 py-1 text-rose-300">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          Handwriting
        </span>
      </div>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
