import { db } from "../db/database";
import type {
  DocumentRecord,
  RagAnswer,
  RagSource,
} from "../types";
import { generateGroundedAnswer } from "./openRouter";
import { retrieveForRag } from "./semanticSearch";

const refusal =
  "The document does not provide enough evidence to answer this question.";

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
    return {
      answer: refusal,
      sources: [],
      grounded: false,
    };

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
    return {
      answer: refusal,
      sources: [],
      grounded: false,
    };

  return {
    answer,
    sources: sources.filter((source) => citedIds.has(source.sourceId)),
    grounded: true,
  };
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
    return { answer: refusal, sources: [], grounded: false };
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
    return { answer: refusal, sources: [], grounded: false };
  return {
    answer,
    sources: sources.filter((source) => citedIds.has(source.sourceId)),
    grounded: true,
  };
}
