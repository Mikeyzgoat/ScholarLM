import { db } from "../db/database";
import type {
  DocumentRecord,
  RagAnswer,
  RagSource,
} from "../types";
import { generateGroundedAnswer } from "./localAi";
import { retrieveForRag } from "./semanticSearch";

const refusal =
  "The document does not provide enough evidence to answer this question.";

export async function answerDocumentQuestion(input: {
  documentId: string;
  question: string;
  signal?: AbortSignal;
}): Promise<RagAnswer> {
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(input.documentId) as DocumentRecord | null;
  if (!document) throw new Error("Document not found");

  const retrieved = await retrieveForRag({
    documentId: input.documentId,
    question: input.question,
    limit: 6,
  });
  const sources: RagSource[] = retrieved.map((result, index) => ({
    ...result,
    sourceId: `S${index + 1}`,
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
