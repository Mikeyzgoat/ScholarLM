import { db } from "../db/database";
import type { ChunkRecord } from "../types";
import { generateEmbedding } from "./localAi";
import { serializeEmbedding } from "../utils/vectors";
export async function embedDocumentChunks(documentId: string): Promise<void> {
  const chunks = db
    .query("SELECT * FROM chunks WHERE document_id=? ORDER BY chunk_index")
    .all(documentId) as ChunkRecord[];
  for (const chunk of chunks) {
    if (chunk.embedding) continue;
    const embedding = await generateEmbedding(chunk.content);
    db.query("UPDATE chunks SET embedding=? WHERE id=?").run(
      serializeEmbedding(embedding),
      chunk.id,
    );
  }
}
