import type { SearchResult } from "../types";
import { generateQueryEmbedding } from "./openRouter";
import { dotProduct, normalizeVector, parseEmbedding } from "../utils/vectors";
import { getDocumentVectorIndex } from "./vectorIndex";
import { db } from "../db/database";
import { ensureDocumentStickiesIndexed } from "./stickyNotes";

interface VectorCandidate {
  result: SearchResult;
  embedding: Float32Array;
}

const ignoredTerms = new Set([
  "a", "an", "and", "are", "do", "explain", "for", "how", "i", "in", "is",
  "it", "of", "on", "the", "this", "to", "what",
]);

function terms(value: string): Set<string> {
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words.flatMap((word) => {
      if (ignoredTerms.has(word) || word.length < 3) return [];
      const stem = word
        .replace(/(ing|edly|edly|ed|es|s)$/u, "")
        .replace(/(ysis|yse|yze)$/u, "ys");
      return stem.length > 5 ? [stem, stem.slice(0, 5)] : [stem];
    }),
  );
}

function lexicalRelevance(query: Set<string>, content: string): number {
  if (!query.size) return 0;
  const contentTerms = terms(content);
  let matches = 0;
  query.forEach((term) => {
    if (contentTerms.has(term)) matches += 1;
  });
  return matches / query.size;
}

function isUsefulChunk(content: string): boolean {
  if (content.trim().length < 80) return false;
  const meaningful = new Set(
    (content.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (term) => term.length > 2 && !ignoredTerms.has(term),
    ),
  );
  return meaningful.size >= 8;
}

async function rankedCandidates(input: {
  documentId: string;
  query: string;
}): Promise<VectorCandidate[]> {
  const vector = normalizeVector(await generateQueryEmbedding(input.query));
  return getDocumentVectorIndex(input.documentId)
    .filter(({ chunk }) => isUsefulChunk(chunk.content))
    .filter(({ embedding }) => embedding.length === vector.length)
    .map(({ chunk, embedding }) => ({
      embedding,
      result: {
        chunkId: chunk.id,
        pageNumber: chunk.page_number,
        content: chunk.content,
        score: dotProduct(vector, embedding),
        kind: "pdf" as const,
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
  await ensureDocumentStickiesIndexed(input.documentId);
  const queryVector = normalizeVector(await generateQueryEmbedding(query));
  const pdfResults = getDocumentVectorIndex(input.documentId)
    .filter(({ embedding }) => embedding.length === queryVector.length)
    .map(({ chunk, embedding }) => ({
      chunkId: chunk.id,
      pageNumber: chunk.page_number,
      content: chunk.content,
      score: dotProduct(queryVector, embedding),
      kind: "pdf" as const,
    }));
  const stickyResults = (
    db
      .query(
        `SELECT id,note_id noteId,shape_id shapeId,label,content,kind,
                explanation_id explanationId,page_number pageNumber,embedding
         FROM sticky_note_index WHERE document_id=?`,
      )
      .all(input.documentId) as Array<{
      id: string;
      noteId: string;
      shapeId: string;
      label: string;
      content: string;
      kind: "explanation" | "note";
      explanationId: string | null;
      pageNumber: number | null;
      embedding: string | Uint8Array;
    }>
  ).flatMap((sticky) => {
    const embedding = normalizeVector(parseEmbedding(sticky.embedding));
    if (embedding.length !== queryVector.length) return [];
    return [{
      chunkId: sticky.id,
      pageNumber: sticky.pageNumber,
      content: sticky.content,
      score: dotProduct(queryVector, embedding),
      kind: "sticky" as const,
      label: sticky.label,
      noteId: sticky.noteId,
      shapeId: sticky.shapeId,
      stickyKind: sticky.kind,
      ...(sticky.explanationId
        ? { explanationId: sticky.explanationId }
        : {}),
    }];
  });
  return [...pdfResults, ...stickyResults]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function retrieveForRag(input: {
  documentId: string;
  question: string;
  limit?: number;
  currentPage?: number;
}): Promise<SearchResult[]> {
  const question = input.question.trim();
  if (!question) throw new Error("Question is required");
  const limit = Math.min(8, Math.max(3, input.limit ?? 6));
  const queryTerms = terms(question);
  const candidates = (await rankedCandidates({
    documentId: input.documentId,
    query: question,
  }))
    .map((candidate) => {
      const pageDistance =
        input.currentPage && candidate.result.pageNumber
          ? Math.abs(input.currentPage - candidate.result.pageNumber)
          : Number.POSITIVE_INFINITY;
      const pageBoost =
        pageDistance === 0 ? 0.14 : pageDistance === 1 ? 0.05 : 0;
      return {
        ...candidate,
        relevance:
          candidate.result.score * 0.72 +
          lexicalRelevance(queryTerms, candidate.result.content) * 0.28 +
          pageBoost,
      };
    })
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, 30);
  const selected: Array<VectorCandidate & { relevance: number }> = [];
  const remaining = [...candidates];
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
      const score = candidate.relevance - redundancy * 0.16 - pagePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected.map((candidate) => candidate.result);
}
