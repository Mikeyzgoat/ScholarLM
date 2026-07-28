import { db } from "../db/database";
import type { ChunkRecord } from "../types";
import { normalizeVector, parseEmbedding } from "../utils/vectors";

export interface IndexedChunk {
  chunk: ChunkRecord;
  embedding: Float32Array;
}

const documentIndexes = new Map<string, IndexedChunk[]>();
let activeDocumentId: string | null = null;

export function getDocumentVectorIndex(documentId: string): IndexedChunk[] {
  if (activeDocumentId !== documentId) {
    documentIndexes.clear();
    activeDocumentId = documentId;
  }
  const cached = documentIndexes.get(documentId);
  if (cached) return cached;
  const index = (
    db
      .query(
        "SELECT * FROM chunks WHERE document_id=? AND embedding IS NOT NULL",
      )
      .all(documentId) as ChunkRecord[]
  ).map((chunk) => ({
    chunk,
    embedding: normalizeVector(parseEmbedding(chunk.embedding!)),
  }));
  documentIndexes.set(documentId, index);
  return index;
}

export function activateDocumentVectorIndex(documentId: string): number {
  return getDocumentVectorIndex(documentId).length;
}

export function invalidateDocumentVectorIndex(documentId: string): void {
  documentIndexes.delete(documentId);
  if (activeDocumentId === documentId) activeDocumentId = null;
}
