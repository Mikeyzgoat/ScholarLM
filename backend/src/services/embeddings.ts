import { db } from "../db/database";
import type { ChunkRecord } from "../types";
import { generateDocumentEmbeddings } from "./openRouter";
import { serializeEmbedding } from "../utils/vectors";
import { invalidateDocumentVectorIndex } from "./vectorIndex";
import { markGraphGroupIndexesStale } from "./manualGraph";

const EMBEDDING_BATCH_SIZE = 128;

function canRetryAsSmallerBatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:400|413)\b|context|input|maximum|payload|too (?:large|long|many)|token/i.test(
    message,
  );
}

async function generateBatchEmbeddings(
  batch: ChunkRecord[],
): Promise<number[][]> {
  try {
    return await generateDocumentEmbeddings(
      batch.map((chunk) => chunk.embedding_content ?? chunk.content),
    );
  } catch (error) {
    if (batch.length <= 1 || !canRetryAsSmallerBatch(error)) throw error;

    const midpoint = Math.ceil(batch.length / 2);
    const left = await generateBatchEmbeddings(batch.slice(0, midpoint));
    const right = await generateBatchEmbeddings(batch.slice(midpoint));
    return [...left, ...right];
  }
}

export async function embedDocumentChunks(documentId: string): Promise<void> {
  const chunks = db
    .query("SELECT * FROM chunks WHERE document_id=? ORDER BY chunk_index")
    .all(documentId) as ChunkRecord[];
  const pending = chunks.filter((chunk) => !chunk.embedding);
  const batches: ChunkRecord[][] = [];
  for (let index = 0; index < pending.length; index += EMBEDDING_BATCH_SIZE)
    batches.push(pending.slice(index, index + EMBEDDING_BATCH_SIZE));
  let cursor = 0;
  const worker = async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      const embeddings = await generateBatchEmbeddings(batch);
      const update = db.query("UPDATE chunks SET embedding=? WHERE id=?");
      db.transaction(() => {
        batch.forEach((chunk, offset) =>
          update.run(serializeEmbedding(embeddings[offset]), chunk.id),
        );
      })();
    }
  };
  await Promise.all([worker(), worker()]);
  invalidateDocumentVectorIndex(documentId);
  if (pending.length) markGraphGroupIndexesStale(documentId);
}
