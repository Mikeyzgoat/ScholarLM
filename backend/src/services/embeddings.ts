import { db } from "../db/database";
import type { ChunkRecord } from "../types";
import { generateDocumentEmbeddings } from "./localAi";
import { serializeEmbedding } from "../utils/vectors";
import { invalidateDocumentVectorIndex } from "./vectorIndex";
export async function embedDocumentChunks(documentId: string): Promise<void> {
  const chunks = db
    .query("SELECT * FROM chunks WHERE document_id=? ORDER BY chunk_index")
    .all(documentId) as ChunkRecord[];
  const pending = chunks.filter((chunk) => !chunk.embedding);
  for (let index = 0; index < pending.length; index += 16) {
    const batch = pending.slice(index, index + 16);
    const embeddings = await generateDocumentEmbeddings(
      batch.map((chunk) => chunk.content),
    );
    const update = db.query("UPDATE chunks SET embedding=? WHERE id=?");
    db.transaction(() => {
      batch.forEach((chunk, offset) =>
        update.run(serializeEmbedding(embeddings[offset]), chunk.id),
      );
    })();
  }
  invalidateDocumentVectorIndex(documentId);
}
