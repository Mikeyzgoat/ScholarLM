import { db } from "../db/database";
import type { ChunkRecord, DocumentRecord, GraphResponse } from "../types";
import { createId } from "../utils/ids";
import { extractConceptGraph } from "./localAi";
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
        db.query("INSERT INTO concept_edges VALUES (?,?,?,?,?,?,?)").run(
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
  if (!document) return { nodes: [], edges: [] };
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
      "SELECT id,title,updated_at updatedAt FROM note_pages WHERE document_id=? ORDER BY updated_at DESC",
    )
    .all(documentId) as Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
  const sourceId = `source:${documentId}`;
  const connected = new Set(
    conceptEdges.flatMap((edge) => [edge.source, edge.target]),
  );
  return {
    nodes: [
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
    ],
    edges: [
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
    ],
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
      "SELECT id,document_id documentId,title FROM note_pages ORDER BY updated_at DESC",
    )
    .all() as Array<{ id: string; documentId: string; title: string }>;
  return {
    nodes: [
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
    ],
    edges: [
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
    ],
  };
}
