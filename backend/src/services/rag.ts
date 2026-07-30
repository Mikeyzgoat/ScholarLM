import { db } from "../db/database";
import type {
  DocumentRecord,
  RagAnswer,
  RagSource,
} from "../types";
import { generateGroundedAnswer } from "./openRouter";
import { retrieveForRag } from "./semanticSearch";
import { createHash } from "node:crypto";

const refusal =
  "The document does not provide enough evidence to answer this question.";

function normalizedQuestion(question: string): string {
  return question.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

const cacheStopWords = new Set([
  "a", "an", "and", "can", "could", "describe", "do", "does", "explain",
  "for", "how", "in", "is", "me", "of", "please", "the", "to", "what",
]);

function cacheQuestionTerms(question: string): Set<string> {
  return new Set(
    (normalizedQuestion(question).match(/[\p{L}\p{N}]+/gu) ?? []).flatMap(
      (word) => {
        if (cacheStopWords.has(word)) return [];
        const stem = word.replace(/(ing|ed|es|s)$/u, "");
        return [stem || word];
      },
    ),
  );
}

function similarQuestionScore(left: string, right: string): number {
  const leftNormalized = normalizedQuestion(left);
  const rightNormalized = normalizedQuestion(right);
  if (leftNormalized === rightNormalized) return 1;
  const leftNumbers = leftNormalized.match(/\d+(?:\.\d+)?/g) ?? [];
  const rightNumbers = rightNormalized.match(/\d+(?:\.\d+)?/g) ?? [];
  if (leftNumbers.join(",") !== rightNumbers.join(",")) return 0;
  const negation = (value: string) =>
    /\b(?:no|not|never|without|except)\b/u.test(value);
  if (negation(leftNormalized) !== negation(rightNormalized)) return 0;
  const leftTerms = cacheQuestionTerms(left);
  const rightTerms = cacheQuestionTerms(right);
  if (!leftTerms.size || !rightTerms.size) return 0;
  let intersection = 0;
  leftTerms.forEach((term) => {
    if (rightTerms.has(term)) intersection += 1;
  });
  const union = new Set([...leftTerms, ...rightTerms]).size;
  const score = intersection / union;
  if (Math.min(leftTerms.size, rightTerms.size) <= 2)
    return score === 1 ? 1 : 0;
  return score >= 0.8 ? score : 0;
}

function documentContentVersion(documentId: string): string {
  const row = db
    .query(
      `SELECT d.updated_at documentUpdatedAt,
              COALESCE(MAX(c.created_at),'') chunksUpdatedAt,
              COALESCE((SELECT MAX(s.updated_at)
                        FROM sticky_note_index s
                        WHERE s.document_id=d.id),'') stickiesUpdatedAt,
              COUNT(c.id) chunkCount
       FROM documents d
       LEFT JOIN chunks c ON c.document_id=d.id
       WHERE d.id=?
       GROUP BY d.id`,
    )
    .get(documentId) as {
    documentUpdatedAt: string;
    chunksUpdatedAt: string;
    stickiesUpdatedAt: string;
    chunkCount: number;
  } | null;
  return createHash("sha256")
    .update(JSON.stringify(row ?? {}))
    .digest("hex");
}

function groupContentVersion(groupId: string, documentIds: string[]): string {
  const group = db
    .query(
      `SELECT g.updated_at updatedAt,COALESCE(i.content_hash,'') indexHash
       FROM manual_graph_groups g
       LEFT JOIN manual_graph_group_index i ON i.group_id=g.id
       WHERE g.id=?`,
    )
    .get(groupId) as { updatedAt: string; indexHash: string } | null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        group,
        documents: documentIds.map((id) => [id, documentContentVersion(id)]),
      }),
    )
    .digest("hex");
}

function answerCacheKey(input: {
  scopeKind: "document" | "group";
  scopeId: string;
  question: string;
  pageNumber?: number;
}): string {
  return createHash("sha256")
    .update(
      [
        input.scopeKind,
        input.scopeId,
        input.pageNumber ?? "",
        normalizedQuestion(input.question),
      ].join("\u001f"),
    )
    .digest("hex");
}

function findCachedAnswer(input: {
  scopeKind: "document" | "group";
  scopeId: string;
  question: string;
  pageNumber?: number;
  contentVersion: string;
}): RagAnswer | null {
  const cacheKey = answerCacheKey(input);
  const row = db
    .query(
      `SELECT answer,sources,grounded
       FROM rag_answer_cache
       WHERE cache_key=? AND content_version=?`,
    )
    .get(cacheKey, input.contentVersion) as {
    answer: string;
    sources: string;
    grounded: number;
  } | null;
  let matched = row;
  let matchedCacheKey = cacheKey;
  if (!matched) {
    const candidates = db
      .query(
        `SELECT cache_key cacheKey,question,answer,sources,grounded
         FROM rag_answer_cache
         WHERE scope_kind=? AND scope_id=? AND content_version=?
           AND page_number IS ?
         ORDER BY last_accessed_at DESC
         LIMIT 100`,
      )
      .all(
        input.scopeKind,
        input.scopeId,
        input.contentVersion,
        input.pageNumber ?? null,
      ) as Array<{
      cacheKey: string;
      question: string;
      answer: string;
      sources: string;
      grounded: number;
    }>;
    const similar = candidates
      .map((candidate) => ({
        candidate,
        score: similarQuestionScore(input.question, candidate.question),
      }))
      .sort((left, right) => right.score - left.score)[0];
    if (!similar || similar.score < 0.8) return null;
    matched = similar.candidate;
    matchedCacheKey = similar.candidate.cacheKey;
  }
  db.query(
    `UPDATE rag_answer_cache
     SET hit_count=hit_count+1,last_accessed_at=?
     WHERE cache_key=?`,
  ).run(new Date().toISOString(), matchedCacheKey);
  try {
    return {
      answer: matched.answer,
      sources: JSON.parse(matched.sources) as RagSource[],
      grounded: Boolean(matched.grounded),
      cached: true,
    };
  } catch {
    db.query("DELETE FROM rag_answer_cache WHERE cache_key=?").run(
      matchedCacheKey,
    );
    return null;
  }
}

function storeCachedAnswer(input: {
  scopeKind: "document" | "group";
  scopeId: string;
  question: string;
  pageNumber?: number;
  contentVersion: string;
  result: RagAnswer;
}): RagAnswer {
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO rag_answer_cache
     (cache_key,scope_kind,scope_id,question,page_number,answer,sources,grounded,content_version,created_at,last_accessed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(cache_key) DO UPDATE SET
       answer=excluded.answer,sources=excluded.sources,
       grounded=excluded.grounded,content_version=excluded.content_version,
       created_at=excluded.created_at,last_accessed_at=excluded.last_accessed_at,
       hit_count=0`,
  ).run(
    answerCacheKey(input),
    input.scopeKind,
    input.scopeId,
    normalizedQuestion(input.question),
    input.pageNumber ?? null,
    input.result.answer,
    JSON.stringify(input.result.sources),
    input.result.grounded ? 1 : 0,
    input.contentVersion,
    now,
    now,
  );
  return { ...input.result, cached: false };
}

export async function answerDocumentQuestion(input: {
  documentId: string;
  question: string;
  currentPage?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<RagAnswer> {
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(input.documentId) as DocumentRecord | null;
  if (!document) throw new Error("Document not found");
  const contentVersion = documentContentVersion(input.documentId);
  const cached = findCachedAnswer({
    scopeKind: "document",
    scopeId: input.documentId,
    question: input.question,
    pageNumber: input.currentPage,
    contentVersion,
  });
  if (cached) {
    input.onToken?.(cached.answer);
    return cached;
  }

  const retrieved = await retrieveForRag({
    documentId: input.documentId,
    question: input.question,
    limit: 6,
    currentPage: input.currentPage,
  });
  const sources: RagSource[] = retrieved.map((result, index) => ({
    ...result,
    pageNumber: result.pageNumber ?? 1,
    sourceId: `S${index + 1}`,
    documentId: document.id,
    documentName: document.name,
  }));
  if (!sources.length)
    return storeCachedAnswer({
      scopeKind: "document",
      scopeId: input.documentId,
      question: input.question,
      pageNumber: input.currentPage,
      contentVersion,
      result: {
      answer: refusal,
      sources: [],
      grounded: false,
      },
    });

  const answer = await generateGroundedAnswer({
    question: input.question,
    documentTitle: document.name,
    sources,
    signal: input.signal,
    onToken: input.onToken,
  });
  const citedIds = new Set<string>();
  for (const match of answer.matchAll(/\bS(\d+)\b/g)) {
    const sourceId = `S${Number(match[1])}`;
    if (sources.some((source) => source.sourceId === sourceId))
      citedIds.add(sourceId);
  }
  if (!citedIds.size)
    return storeCachedAnswer({
      scopeKind: "document",
      scopeId: input.documentId,
      question: input.question,
      pageNumber: input.currentPage,
      contentVersion,
      result: {
      answer: refusal,
      sources: [],
      grounded: false,
      },
    });

  return storeCachedAnswer({
    scopeKind: "document",
    scopeId: input.documentId,
    question: input.question,
    pageNumber: input.currentPage,
    contentVersion,
    result: {
      answer,
      sources: sources.filter((source) => citedIds.has(source.sourceId)),
      grounded: true,
    },
  });
}

export async function answerDocumentGroupQuestion(input: {
  groupId: string;
  question: string;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<RagAnswer> {
  const group = db
    .query(
      "SELECT name FROM manual_graph_groups WHERE id=? AND scope_key='global'",
    )
    .get(input.groupId) as { name: string } | null;
  if (!group) throw new Error("PDF group not found");
  const documents = db
    .query(
      `SELECT d.* FROM manual_graph_group_members m
       JOIN documents d ON m.node_id='source:' || d.id
       WHERE m.group_id=? AND d.status='ready'
       ORDER BY d.created_at`,
    )
    .all(input.groupId) as DocumentRecord[];
  if (documents.length < 2)
    throw new Error("A PDF group needs at least two ready documents");
  const contentVersion = groupContentVersion(
    input.groupId,
    documents.map((document) => document.id),
  );
  const cached = findCachedAnswer({
    scopeKind: "group",
    scopeId: input.groupId,
    question: input.question,
    contentVersion,
  });
  if (cached) {
    input.onToken?.(cached.answer);
    return cached;
  }
  const candidates = (
    await Promise.all(
      documents.map(async (document) => {
        const results = await retrieveForRag({
          documentId: document.id,
          question: input.question,
          limit: 4,
        });
        return results.map((result) => ({
          ...result,
          documentId: document.id,
          documentName: document.name,
        }));
      }),
    )
  )
    .flat()
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
  const sources: RagSource[] = candidates.map((result, index) => ({
    ...result,
    pageNumber: result.pageNumber ?? 1,
    sourceId: `S${index + 1}`,
  }));
  if (!sources.length)
    return storeCachedAnswer({
      scopeKind: "group",
      scopeId: input.groupId,
      question: input.question,
      contentVersion,
      result: { answer: refusal, sources: [], grounded: false },
    });
  const answer = await generateGroundedAnswer({
    question: input.question,
    documentTitle: `${group.name}: ${documents.map((document) => document.name).join(", ")}`,
    sources,
    signal: input.signal,
    onToken: input.onToken,
  });
  const citedIds = new Set<string>();
  for (const match of answer.matchAll(/\bS(\d+)\b/g)) {
    const sourceId = `S${Number(match[1])}`;
    if (sources.some((source) => source.sourceId === sourceId))
      citedIds.add(sourceId);
  }
  if (!citedIds.size)
    return storeCachedAnswer({
      scopeKind: "group",
      scopeId: input.groupId,
      question: input.question,
      contentVersion,
      result: { answer: refusal, sources: [], grounded: false },
    });
  return storeCachedAnswer({
    scopeKind: "group",
    scopeId: input.groupId,
    question: input.question,
    contentVersion,
    result: {
      answer,
      sources: sources.filter((source) => citedIds.has(source.sourceId)),
      grounded: true,
    },
  });
}
