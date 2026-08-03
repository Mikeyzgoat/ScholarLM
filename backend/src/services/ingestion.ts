import { db } from "../db/database";
import type { DocumentStatus } from "../types";
import type { ExtractedPdfPage } from "./pdf";
import type { TextChunk } from "./chunking";
import { extractPdf } from "./pdf";
import { chunkPages } from "./chunking";
import { embedDocumentChunks } from "./embeddings";
import { buildKnowledgeGraph } from "./knowledgeGraph";
import { createId } from "../utils/ids";
import { preparePagesForIndexing } from "./indexText";
import { addTableContext } from "./tableText";
import { compactDocumentEmbeddingText } from "./embeddingText";
import { addVisualContext } from "./visualIngestion";
import { generateDocumentEmbeddings } from "./openRouter";
import { serializeEmbedding } from "../utils/vectors";
import { invalidateDocumentVectorIndex } from "./vectorIndex";
import { markGraphGroupIndexesStale } from "./manualGraph";

async function appendVisualContext(
  documentId: string,
  originalPages: ExtractedPdfPage[],
  enrichedPages: ExtractedPdfPage[],
): Promise<void> {
  const originalByPage = new Map(
    originalPages.map((page) => [page.pageNumber, page.content.trim()]),
  );
  const contexts = enrichedPages.flatMap((page) => {
    const original = originalByPage.get(page.pageNumber) ?? "";
    const marker = "Visual context:";
    const markerIndex = page.content.indexOf(marker, original.length);
    if (markerIndex < 0) return [];
    const context = page.content.slice(markerIndex + marker.length).trim();
    return context ? [{ pageNumber: page.pageNumber, content: context }] : [];
  });
  if (!contexts.length) return;
  const visualChunks = chunkPages(contexts, {
    maxCharacters: 1800,
    overlapCharacters: 120,
  });
  const embeddings: number[][] = [];
  for (let index = 0; index < visualChunks.length; index += 64)
    embeddings.push(
      ...(await generateDocumentEmbeddings(
        visualChunks
          .slice(index, index + 64)
          .map((chunk) => compactDocumentEmbeddingText(chunk.content)),
      )),
    );
  const now = new Date().toISOString();
  db.transaction(() => {
    db.query(
      "DELETE FROM chunks WHERE document_id=? AND content LIKE 'Visual context:%'",
    ).run(documentId);
    const maximum = (
      db
        .query(
          "SELECT COALESCE(MAX(chunk_index),-1) maximum FROM chunks WHERE document_id=?",
        )
        .get(documentId) as { maximum: number }
    ).maximum;
    const insert = db.query(
      `INSERT INTO chunks
       (id,document_id,page_number,chunk_index,content,embedding,created_at,embedding_content)
       VALUES (?,?,?,?,?,?,?,?)`,
    );
    visualChunks.forEach((chunk, index) => {
      const content = `Visual context:\n${chunk.content}`;
      insert.run(
        createId(),
        documentId,
        chunk.pageNumber,
        maximum + index + 1,
        content,
        serializeEmbedding(embeddings[index]),
        now,
        compactDocumentEmbeddingText(content),
      );
    });
    const updatePage = db.query(
      "UPDATE document_pages SET content=? WHERE document_id=? AND page_number=?",
    );
    enrichedPages.forEach((page) =>
      updatePage.run(page.content, documentId, page.pageNumber),
    );
  })();
  invalidateDocumentVectorIndex(documentId);
  markGraphGroupIndexesStale(documentId);
}

async function enrichVisualsInBackground(input: {
  documentId: string;
  filePath: string;
  documentTitle: string;
  originalPages: ExtractedPdfPage[];
}): Promise<void> {
  try {
    const extracted = await extractPdf(input.filePath, { includeVisuals: true });
    if (!extracted.pages.some((page) => page.visualImageDataUrl)) return;
    const enriched = await addVisualContext(
      extracted.pages,
      input.documentTitle,
    );
    await appendVisualContext(input.documentId, input.originalPages, enriched);
  } catch (error) {
    console.warn(
      `[visual-ingestion] Background enrichment skipped for ${input.documentId}`,
      error,
    );
  }
}
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
    const insert = db.query(
      `INSERT INTO chunks
       (id,document_id,page_number,chunk_index,content,embedding,created_at,embedding_content)
       VALUES (?,?,?,?,?,?,?,?)`,
    );
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
        compactDocumentEmbeddingText(c.content),
      );
  });
  tx();
}
export async function ingestDocument(documentId: string): Promise<void> {
  try {
    await updateDocumentStatus(documentId, "extracting");
    const row = db
      .query("SELECT file_path,name FROM documents WHERE id=?")
      .get(documentId) as { file_path: string; name: string } | null;
    if (!row) throw new Error("Document not found");
    const extracted = await extractPdf(row.file_path, { includeVisuals: false });
    await saveDocumentPages(documentId, extracted.pages);
    db.query("UPDATE documents SET page_count=?,updated_at=? WHERE id=?").run(
      extracted.pageCount,
      new Date().toISOString(),
      documentId,
    );
    await updateDocumentStatus(documentId, "chunking");
    await saveChunks(
      documentId,
      chunkPages(addTableContext(preparePagesForIndexing(extracted.pages)), {
        maxCharacters: 1800,
        overlapCharacters: 120,
      }),
    );
    await updateDocumentStatus(documentId, "embedding");
    await embedDocumentChunks(documentId);
    await updateDocumentStatus(documentId, "graphing");
    await buildKnowledgeGraph(documentId);
    await updateDocumentStatus(documentId, "ready");
    setTimeout(
      () =>
        void enrichVisualsInBackground({
          documentId,
          filePath: row.file_path,
          documentTitle: row.name,
          originalPages: extracted.pages,
        }),
      0,
    );
  } catch (e) {
    await updateDocumentStatus(
      documentId,
      "failed",
      e instanceof Error ? e.message : String(e),
    );
  }
}

export async function resumePendingIngestions(): Promise<void> {
  const rows = db
    .query(
      "SELECT id FROM documents WHERE status NOT IN ('ready','failed') ORDER BY created_at",
    )
    .all() as Array<{ id: string }>;
  for (const row of rows) await ingestDocument(row.id);
}
