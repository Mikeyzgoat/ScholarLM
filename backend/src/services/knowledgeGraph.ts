import { db } from "../db/database";
import type { ChunkRecord, DocumentRecord, GraphResponse } from "../types";
import { createId } from "../utils/ids";
import { extractConceptGraph } from "./openRouter";
import { extractStickies } from "./stickyNotes";
import { getManualGraphData } from "./manualGraph";

interface GraphNote {
  id: string;
  documentId?: string;
  title: string;
  snapshot: string;
}

interface HandwritingRow {
  id: string;
  documentId: string | null;
  noteId: string | null;
  canvasId: string | null;
  shapeId: string | null;
  canvasTitle: string | null;
  label: string;
  description: string;
  pageNumber: number | null;
}

interface StandaloneGraphCanvas {
  id: string;
  title: string;
  snapshot: string;
}

interface DrawingCanvasSource extends StandaloneGraphCanvas {
  noteId?: string;
  canvasId?: string;
}

function canvasDrawingNodes(canvases: DrawingCanvasSource[]) {
  return canvases.flatMap((canvas) => {
    try {
      const snapshot = JSON.parse(canvas.snapshot) as {
        document?: { store?: Record<string, unknown> };
      };
      const store = snapshot.document?.store ?? {};
      const drawings = Object.values(store).filter((value) => {
        if (!value || typeof value !== "object") return false;
        const record = value as { typeName?: unknown; type?: unknown };
        return (
          record.typeName === "shape" &&
          ["draw", "line", "arrow"].includes(String(record.type))
        );
      }) as Array<{ id: string; parentId: string }>;
      const byPage = new Map<
        string,
        { pageName: string; count: number; shapeIds: string[] }
      >();
      drawings.forEach((drawing) => {
        let parentId = drawing.parentId;
        for (let depth = 0; depth < 20 && parentId; depth += 1) {
          const parent = store[parentId] as {
            id?: unknown;
            parentId?: unknown;
            typeName?: unknown;
            name?: unknown;
          } | undefined;
          if (!parent) break;
          if (parent.typeName === "page" && typeof parent.id === "string") {
            const current = byPage.get(parent.id);
            byPage.set(parent.id, {
              pageName:
                typeof parent.name === "string" ? parent.name : "Canvas page",
              count: (current?.count ?? 0) + 1,
              shapeIds: [...(current?.shapeIds ?? []), drawing.id],
            });
            break;
          }
          parentId =
            typeof parent.parentId === "string" ? parent.parentId : "";
        }
      });
      return [...byPage.entries()].map(([pageId, page]) => ({
        id: `canvas-drawing:${canvas.id}:${pageId}`,
        label: `${canvas.title} · ${page.pageName}`,
        description: `${page.count} handwritten canvas element${page.count === 1 ? "" : "s"}`,
        pageNumber: null,
        kind: "handwriting" as const,
        noteId: canvas.noteId,
        canvasId: canvas.canvasId,
        shapeId: page.shapeIds[0],
        shapeIds: page.shapeIds,
      }));
    } catch {
      return [];
    }
  });
}

function handwritingNodes(rows: HandwritingRow[]) {
  return rows.map((row) => ({
    id: `handwriting:${row.id}`,
    label:
      row.label === "Handwritten equation" ||
      row.label === "Handwritten canvas selection"
        ? "Handwritten selection"
        : row.label,
    description: row.description,
    pageNumber: row.pageNumber,
    kind: "handwriting" as const,
    documentId: row.documentId ?? undefined,
    noteId: row.noteId ?? undefined,
    canvasId: row.canvasId ?? undefined,
    shapeId: row.shapeId ?? undefined,
  }));
}

function getHandwritingRows(documentId?: string): HandwritingRow[] {
  return db
    .query(
      `SELECT id,documentId,noteId,canvasId,shapeId,canvasTitle,
              label,description,pageNumber
       FROM (
         SELECT id,document_id documentId,note_id noteId,
                canvas_id canvasId,shape_id shapeId,
                document_title canvasTitle,
                COALESCE(NULLIF(recognized_text,''),selected_text) label,
                explanation description,page_number pageNumber,created_at,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(note_id,''),COALESCE(canvas_id,''),
                               COALESCE(shape_id,id)
                  ORDER BY created_at DESC,id DESC
                ) sourceRank
         FROM explanation_history
         WHERE input_kind='handwriting'
           ${documentId ? "AND document_id=?" : ""}
       )
       WHERE sourceRank=1
       ORDER BY created_at DESC`,
    )
    .all(...(documentId ? [documentId] : [])) as HandwritingRow[];
}

function stickyNodes(notes: GraphNote[]) {
  return notes.flatMap((note) =>
    extractStickies({
      noteId: note.id,
      documentId: note.documentId ?? "",
      snapshot: note.snapshot,
    }).map((sticky) => ({
      id: sticky.id,
      label: sticky.label,
      description: sticky.content,
      pageNumber: sticky.pageNumber ?? null,
      kind: "sticky" as const,
      documentId: note.documentId,
      noteId: note.id,
      shapeId: sticky.shapeId,
      stickyKind: sticky.kind,
      explanationId: sticky.explanationId,
    })),
  );
}
export async function buildKnowledgeGraph(documentId: string): Promise<void> {
  const doc = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(documentId) as DocumentRecord | null;
  if (!doc) throw new Error("Document not found");
  const chunks = (
    db
      .query("SELECT * FROM chunks WHERE document_id=? ORDER BY chunk_index")
      .all(documentId) as ChunkRecord[]
  )
    .filter(
      (_, i) =>
        i %
          Math.max(
            1,
            Math.ceil(
              (
                db
                  .query(
                    "SELECT COUNT(*) count FROM chunks WHERE document_id=?",
                  )
                  .get(documentId) as { count: number }
              ).count / 8,
            ),
          ) ===
        0,
    )
    .slice(0, 8)
    .map((c) => ({
      content: c.content.slice(0, 800),
      pageNumber: c.page_number,
    }));
  let graph: Awaited<ReturnType<typeof extractConceptGraph>> = {
    concepts: [],
    edges: [],
  };
  try {
    graph = await extractConceptGraph({ documentTitle: doc.name, chunks });
  } catch (error) {
    console.warn(
      `[graph] Concept extraction failed for ${documentId}; keeping the source bead available.`,
      error,
    );
  }
  const normalized = new Map<
    string,
    {
      id: string;
      label: string;
      description: string;
      pageNumber: number | null;
    }
  >();
  for (const c of graph.concepts) {
    const key = c.label.trim().toLowerCase();
    if (key && !normalized.has(key))
      normalized.set(key, {
        id: createId(),
        label: c.label.trim(),
        description: c.description?.trim() || "",
        pageNumber: c.pageNumber,
      });
  }
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.query("DELETE FROM concept_edges WHERE document_id=?").run(documentId);
    db.query("DELETE FROM concepts WHERE document_id=?").run(documentId);
    for (const c of normalized.values())
      db.query("INSERT INTO concepts VALUES (?,?,?,?,?,?)").run(
        c.id,
        documentId,
        c.label,
        c.description,
        c.pageNumber,
        now,
      );
    for (const e of graph.edges) {
      const source = normalized.get(e.source.trim().toLowerCase()),
        target = normalized.get(e.target.trim().toLowerCase());
      if (source && target && source.id !== target.id)
        db.query("INSERT INTO concept_edges VALUES (?,?,?,?,?,?)").run(
          createId(),
          documentId,
          source.id,
          target.id,
          e.relationship.trim(),
          now,
        );
    }
  });
  transaction();
}
export function getKnowledgeGraph(documentId: string): GraphResponse {
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(documentId) as DocumentRecord | null;
  if (!document) return { nodes: [], edges: [], groups: [] };
  const concepts = db
    .query(
      "SELECT id,label,description,page_number pageNumber FROM concepts WHERE document_id=?",
    )
    .all(documentId) as GraphResponse["nodes"];
  const conceptEdges = db
    .query(
      "SELECT id,source_concept_id source,target_concept_id target,relationship FROM concept_edges WHERE document_id=?",
    )
    .all(documentId) as GraphResponse["edges"];
  const notes = db
    .query(
      "SELECT id,title,snapshot,updated_at updatedAt FROM note_pages WHERE document_id=? ORDER BY updated_at DESC",
    )
    .all(documentId) as Array<{
    id: string;
    title: string;
    snapshot: string;
    updatedAt: string;
  }>;
  const stickies = stickyNodes(
    notes.map((note) => ({ ...note, documentId })),
  );
  const handwriting = handwritingNodes(getHandwritingRows(documentId));
  const drawingPages = canvasDrawingNodes(
    notes.map((note) => ({ ...note, noteId: note.id })),
  );
  const sourceId = `source:${documentId}`;
  const connected = new Set(
    conceptEdges.flatMap((edge) => [edge.source, edge.target]),
  );
  const nodes: GraphResponse["nodes"] = [
      {
        id: sourceId,
        label: document.name,
        description: "Uploaded PDF source",
        pageNumber: null,
        kind: "source",
        documentId,
      },
      ...concepts.map((node) => ({
        ...node,
        kind: "concept" as const,
        documentId,
      })),
      ...notes.map((note) => ({
        id: `note:${note.id}`,
        label: note.title,
        description: "Linked canvas note",
        pageNumber: null,
        kind: "note" as const,
        documentId,
        noteId: note.id,
      })),
      ...stickies,
      ...drawingPages,
      ...handwriting,
    ];
  const edges: GraphResponse["edges"] = [
      ...conceptEdges,
      ...concepts
        .filter((node) => !connected.has(node.id))
        .map((node) => ({
          id: `source-link:${node.id}`,
          source: sourceId,
          target: node.id,
          relationship: "contains",
        })),
      ...notes.map((note) => ({
        id: `note-link:${note.id}`,
        source: sourceId,
        target: `note:${note.id}`,
        relationship: "note",
      })),
      ...stickies.map((sticky) => ({
        id: `sticky-link:${sticky.id}`,
        source: `note:${sticky.noteId}`,
        target: sticky.id,
        relationship: "explanation",
      })),
      ...drawingPages.map((page) => ({
        id: `canvas-drawing-link:${page.id}`,
        source: `note:${page.noteId}`,
        target: page.id,
        relationship: "handwriting",
      })),
      ...handwriting.map((item) => ({
        id: `handwriting-link:${item.id}`,
        source:
          item.noteId && notes.some((note) => note.id === item.noteId)
            ? `note:${item.noteId}`
            : sourceId,
        target: item.id,
        relationship: "handwriting",
      })),
    ];
  const manual = getManualGraphData(
    { kind: "document", documentId },
    new Set(nodes.map((node) => node.id)),
  );
  return {
    nodes,
    edges: [...edges, ...manual.edges],
    groups: manual.groups,
  };
}

export function getGlobalKnowledgeGraph(): GraphResponse {
  const documents = db
    .query(
      "SELECT id,name,original_name,status FROM documents ORDER BY created_at",
    )
    .all() as Array<{
    id: string;
    name: string;
    original_name: string;
    status: string;
  }>;
  const hubId = "scholarlm:hub";
  const notes = db
    .query(
      "SELECT id,document_id documentId,title,snapshot FROM note_pages ORDER BY updated_at DESC",
    )
    .all() as Array<{
    id: string;
    documentId: string;
    title: string;
    snapshot: string;
  }>;
  const stickies = stickyNodes(notes);
  const handwritingRows = getHandwritingRows();
  const handwriting = handwritingNodes(handwritingRows);
  const savedCanvases = db
    .query("SELECT id,title,snapshot FROM standalone_canvases")
    .all() as StandaloneGraphCanvas[];
  const drawingPages = canvasDrawingNodes([
    ...notes.map((note) => ({ ...note, noteId: note.id })),
    ...savedCanvases.map((canvas) => ({
      ...canvas,
      canvasId: canvas.id,
    })),
  ]);
  const localCanvases = [
    ...new Map(
      [
        ...savedCanvases.map((canvas) => ({
          id: `canvas:${canvas.id}`,
          label: canvas.title,
          description: "Saved standalone canvas",
          pageNumber: null,
          kind: "note" as const,
          canvasId: canvas.id,
        })),
        ...handwritingRows
          .filter((row) => row.canvasId && !row.documentId)
          .map((row) => ({
            id: `canvas:${row.canvasId}`,
            label: row.canvasTitle || "Independent canvas",
            description: "Local handwritten canvas",
            pageNumber: null,
            kind: "note" as const,
            canvasId: row.canvasId!,
          })),
      ].map((canvas) => [canvas.canvasId, canvas]),
    ).values(),
  ];
  const nodes: GraphResponse["nodes"] = [
      {
        id: hubId,
        label: "ScholarLM",
        description: "Your connected knowledge library",
        pageNumber: null,
        kind: "hub",
      },
      ...documents.map((document) => ({
        id: `source:${document.id}`,
        label: document.name,
        description:
          document.status === "ready"
            ? `Source · ${document.original_name}`
            : `Source · ${document.original_name} · ${document.status}`,
        pageNumber: null,
        kind: "source" as const,
        documentId: document.id,
      })),
      ...notes.map((note) => ({
        id: `note:${note.id}`,
        label: note.title,
        description: "Linked canvas note",
        pageNumber: null,
        kind: "note" as const,
        documentId: note.documentId,
        noteId: note.id,
      })),
      ...localCanvases,
      ...stickies,
      ...drawingPages,
      ...handwriting,
    ];
  const edges: GraphResponse["edges"] = [
      ...documents.map((document) => ({
        id: `library-link:${document.id}`,
        source: hubId,
        target: `source:${document.id}`,
        relationship: "source",
      })),
      ...notes.map((note) => ({
        id: `note-link:${note.id}`,
        source: `source:${note.documentId}`,
        target: `note:${note.id}`,
        relationship: "note",
      })),
      ...localCanvases.map((canvas) => ({
        id: `canvas-link:${canvas.canvasId}`,
        source: hubId,
        target: canvas.id,
        relationship: "canvas",
      })),
      ...stickies.map((sticky) => ({
        id: `sticky-link:${sticky.id}`,
        source: `note:${sticky.noteId}`,
        target: sticky.id,
        relationship: "explanation",
      })),
      ...drawingPages.map((page) => ({
        id: `canvas-drawing-link:${page.id}`,
        source: page.noteId
          ? `note:${page.noteId}`
          : `canvas:${page.canvasId}`,
        target: page.id,
        relationship: "handwriting",
      })),
      ...handwriting.flatMap((item) => {
        const source = item.noteId
          ? `note:${item.noteId}`
          : item.documentId
            ? `source:${item.documentId}`
            : item.canvasId
              ? `canvas:${item.canvasId}`
              : null;
        return source
          ? [{
              id: `handwriting-link:${item.id}`,
              source,
              target: item.id,
              relationship: "handwriting",
            }]
          : [];
      }),
    ];
  const manual = getManualGraphData(
    { kind: "global" },
    new Set(nodes.map((node) => node.id)),
  );
  return {
    nodes,
    edges: [...edges, ...manual.edges],
    groups: manual.groups,
  };
}
