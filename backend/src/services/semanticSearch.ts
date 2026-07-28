import { db } from "../db/database";
import type { ChunkRecord, SearchResult } from "../types";
import { generateEmbedding } from "./localAi";
import { cosineSimilarity, parseEmbedding } from "../utils/vectors";
export async function semanticSearch(input: {
  documentId: string;
  query: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (!query) throw new Error("Search query is required");
  const limit = Math.min(20, Math.max(1, input.limit ?? 8));
  const vector = await generateEmbedding(query);
  return (
    db
      .query(
        "SELECT * FROM chunks WHERE document_id=? AND embedding IS NOT NULL",
      )
      .all(input.documentId) as ChunkRecord[]
  )
    .map((c) => ({ chunk: c, embedding: parseEmbedding(c.embedding!) }))
    .filter(({ embedding }) => embedding.length === vector.length)
    .map(({ chunk: c, embedding }) => ({
      chunkId: c.id,
      pageNumber: c.page_number,
      content: c.content,
      score: cosineSimilarity(vector, embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
