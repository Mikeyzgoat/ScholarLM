import type { SearchResult } from "../types";
import { generateQueryEmbedding } from "./localAi";
import { dotProduct, normalizeVector } from "../utils/vectors";
import { getDocumentVectorIndex } from "./vectorIndex";

interface VectorCandidate {
  result: SearchResult;
  embedding: Float32Array;
}

async function rankedCandidates(input: {
  documentId: string;
  query: string;
}): Promise<VectorCandidate[]> {
  const vector = normalizeVector(await generateQueryEmbedding(input.query));
  return getDocumentVectorIndex(input.documentId)
    .filter(({ embedding }) => embedding.length === vector.length)
    .map(({ chunk, embedding }) => ({
      embedding,
      result: {
        chunkId: chunk.id,
        pageNumber: chunk.page_number,
        content: chunk.content,
        score: dotProduct(vector, embedding),
      },
    }))
    .sort((left, right) => right.result.score - left.result.score);
}

export async function semanticSearch(input: {
  documentId: string;
  query: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (!query) throw new Error("Search query is required");
  const limit = Math.min(20, Math.max(1, input.limit ?? 8));
  return (await rankedCandidates({ ...input, query }))
    .slice(0, limit)
    .map((candidate) => candidate.result);
}

export async function retrieveForRag(input: {
  documentId: string;
  question: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const question = input.question.trim();
  if (!question) throw new Error("Question is required");
  const limit = Math.min(8, Math.max(3, input.limit ?? 6));
  const candidates = (
    await rankedCandidates({
      documentId: input.documentId,
      query: question,
    })
  ).slice(0, 24);
  const topScore = candidates[0]?.result.score ?? 0;
  if (topScore < 0.42) return [];

  const eligible = candidates.filter(
    (candidate) =>
      candidate.result.score >= 0.42 &&
      candidate.result.score >= topScore - 0.14,
  );
  const selected: VectorCandidate[] = [];
  const remaining = [...eligible];
  while (selected.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const redundancy = selected.length
        ? Math.max(
            ...selected.map((item) =>
              dotProduct(candidate.embedding, item.embedding),
            ),
          )
        : 0;
      const pagePenalty = selected.some(
        (item) => item.result.pageNumber === candidate.result.pageNumber,
      )
        ? 0.04
        : 0;
      const score =
        candidate.result.score * 0.78 - redundancy * 0.22 - pagePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected.map((candidate) => candidate.result);
}
