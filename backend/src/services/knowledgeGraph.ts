import { db } from "../db/database";
import type { ChunkRecord, DocumentRecord, GraphResponse } from "../types";
import { createId } from "../utils/ids";
import { extractConceptGraph } from "./gemini";
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
              ).count / 20,
            ),
          ) ===
        0,
    )
    .slice(0, 20)
    .map((c) => ({
      content: c.content.slice(0, 1500),
      pageNumber: c.page_number,
    }));
  const graph = await extractConceptGraph({ documentTitle: doc.name, chunks });
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
  const nodes = db
    .query(
      "SELECT id,label,description,page_number pageNumber FROM concepts WHERE document_id=?",
    )
    .all(documentId) as GraphResponse["nodes"];
  const edges = db
    .query(
      "SELECT id,source_concept_id source,target_concept_id target,relationship FROM concept_edges WHERE document_id=?",
    )
    .all(documentId) as GraphResponse["edges"];
  return { nodes, edges };
}
