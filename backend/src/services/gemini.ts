import { GoogleGenAI } from "@google/genai";
import { env } from "../env";
const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
export function getGeminiClient(): GoogleGenAI {
  return client;
}
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await client.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
  });
  const values = response.embeddings?.[0]?.values;
  if (!values?.length) throw new Error("Gemini returned no embedding");
  return values;
}
export async function explainSelectedText(input: {
  selectedText: string;
  documentTitle?: string;
  pageNumber?: number;
}): Promise<string> {
  const context = [
    input.documentTitle && `Document: ${input.documentTitle}`,
    input.pageNumber && `Page: ${input.pageNumber}`,
  ]
    .filter(Boolean)
    .join("\n");
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Explain only the selected passage below. Do not answer unrelated questions. Use clear educational language, preserve important technical terminology, use short paragraphs, and return plain text.\n${context}\n\nSELECTED PASSAGE:\n${input.selectedText}`,
  });
  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned no explanation");
  return text;
}
export async function extractConceptGraph(input: {
  documentTitle: string;
  chunks: Array<{ content: string; pageNumber: number }>;
}): Promise<{
  concepts: Array<{
    label: string;
    description: string;
    pageNumber: number | null;
  }>;
  edges: Array<{ source: string; target: string; relationship: string }>;
}> {
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Extract a knowledge graph from "${input.documentTitle}". Return JSON only with concepts (maximum 30: label, description, pageNumber) and meaningful edges (source, target, relationship). Every edge label must exactly match a concept label. Use the most relevant page.\n\n${input.chunks.map((c) => `[Page ${c.pageNumber}] ${c.content}`).join("\n\n")}`,
    config: { responseMimeType: "application/json" },
  });
  const raw = response.text?.trim();
  if (!raw) throw new Error("Gemini returned no graph");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object")
    throw new Error("Invalid graph response");
  const value = parsed as { concepts?: unknown; edges?: unknown };
  if (!Array.isArray(value.concepts) || !Array.isArray(value.edges))
    throw new Error("Invalid graph response");
  return {
    concepts: value.concepts
      .slice(0, 30)
      .filter(
        (
          v,
        ): v is {
          label: string;
          description: string;
          pageNumber: number | null;
        } =>
          !!v &&
          typeof v.label === "string" &&
          typeof v.description === "string" &&
          (typeof v.pageNumber === "number" || v.pageNumber === null),
      ),
    edges: value.edges.filter(
      (v): v is { source: string; target: string; relationship: string } =>
        !!v &&
        typeof v.source === "string" &&
        typeof v.target === "string" &&
        typeof v.relationship === "string",
    ),
  };
}
