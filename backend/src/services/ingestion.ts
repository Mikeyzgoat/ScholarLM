import { db } from "../db/database";
import type { DocumentStatus } from "../types";
import type { ExtractedPdfPage } from "./pdf";
import type { TextChunk } from "./chunking";
import { extractPdf } from "./pdf";
import { chunkPages } from "./chunking";
import { embedDocumentChunks } from "./embeddings";
import { buildKnowledgeGraph } from "./knowledgeGraph";
import { createId } from "../utils/ids";
async function updateDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  errorMessage?: string,
): Promise<void> {
  db.query(
    "UPDATE documents SET status=?,error_message=?,updated_at=? WHERE id=?",
  ).run(status, errorMessage ?? null, new Date().toISOString(), documentId);
}
async function saveDocumentPages(
  documentId: string,
  pages: ExtractedPdfPage[],
): Promise<void> {
  const tx = db.transaction(() => {
    db.query("DELETE FROM document_pages WHERE document_id=?").run(documentId);
    const insert = db.query("INSERT INTO document_pages VALUES (?,?,?,?,?)");
    const now = new Date().toISOString();
    for (const p of pages)
      insert.run(createId(), documentId, p.pageNumber, p.content, now);
  });
  tx();
}
async function saveChunks(
  documentId: string,
  chunks: TextChunk[],
): Promise<void> {
  const tx = db.transaction(() => {
    db.query("DELETE FROM chunks WHERE document_id=?").run(documentId);
    const insert = db.query("INSERT INTO chunks VALUES (?,?,?,?,?,?,?)");
    const now = new Date().toISOString();
    for (const c of chunks)
      insert.run(
        createId(),
        documentId,
        c.pageNumber,
        c.chunkIndex,
        c.content,
        null,
        now,
      );
  });
  tx();
}
export async function ingestDocument(documentId: string): Promise<void> {
  try {
    await updateDocumentStatus(documentId, "extracting");
    const row = db
      .query("SELECT file_path FROM documents WHERE id=?")
      .get(documentId) as { file_path: string } | null;
    if (!row) throw new Error("Document not found");
    const extracted = await extractPdf(row.file_path);
    await saveDocumentPages(documentId, extracted.pages);
    db.query("UPDATE documents SET page_count=?,updated_at=? WHERE id=?").run(
      extracted.pageCount,
      new Date().toISOString(),
      documentId,
    );
    await updateDocumentStatus(documentId, "chunking");
    await saveChunks(documentId, chunkPages(extracted.pages));
    await updateDocumentStatus(documentId, "embedding");
    await embedDocumentChunks(documentId);
    await updateDocumentStatus(documentId, "graphing");
    await buildKnowledgeGraph(documentId);
    await updateDocumentStatus(documentId, "ready");
  } catch (e) {
    await updateDocumentStatus(
      documentId,
      "failed",
      e instanceof Error ? e.message : String(e),
    );
  }
}
