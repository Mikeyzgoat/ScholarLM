import { GoogleGenAI } from "@google/genai";
import { env } from "../env";

const clients = env.GEMINI_API_KEYS.map(
  (apiKey) => new GoogleGenAI({ apiKey }),
);
let preferOllama = clients.length === 0;

export function getGeminiClient(): GoogleGenAI {
  const client = clients[0];
  if (!client) throw new Error("No Gemini API key is configured");
  return client;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runWithFallback<T>(
  geminiOperation: (client: GoogleGenAI) => Promise<T>,
  sglangOperation: (() => Promise<T>) | null,
  ollamaOperation: () => Promise<T>,
): Promise<T> {
  const failures: string[] = [];
  if (!preferOllama) {
    for (let index = 0; index < clients.length; index += 1) {
      try {
        return await geminiOperation(clients[index]);
      } catch (error) {
        failures.push(`Gemini key ${index + 1}: ${errorMessage(error)}`);
        if (index < clients.length - 1) await wait(350 * (index + 1));
      }
    }
    preferOllama = true;
  }
  if (sglangOperation && env.SGLANG_BASE_URL && env.SGLANG_MODEL) {
    try {
      return await sglangOperation();
    } catch (error) {
      failures.push(`SGLang: ${errorMessage(error)}`);
    }
  }
  try {
    return await ollamaOperation();
  } catch (error) {
    failures.push(`Ollama: ${errorMessage(error)}`);
    throw new Error(`AI providers unavailable. ${failures.join(" | ")}`);
  }
}

async function sglangGenerate(input: {
  prompt: string;
  system?: string;
  json?: boolean;
}): Promise<string> {
  const response = await fetch(`${env.SGLANG_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SGLANG_MODEL,
      messages: [
        ...(input.system ? [{ role: "system", content: input.system }] : []),
        { role: "user", content: input.prompt },
      ],
      stream: false,
      temperature: 0.2,
      response_format: input.json ? { type: "json_object" } : undefined,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: unknown };
  } | null;
  if (!response.ok)
    throw new Error(
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `SGLang returned ${response.status}`,
    );
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new Error("SGLang returned no content");
  return content.trim();
}

async function ollamaGenerate(input: {
  prompt: string;
  system?: string;
  json?: boolean;
}): Promise<string> {
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_MODEL,
      prompt: input.prompt,
      system: input.system,
      format: input.json ? "json" : undefined,
      stream: false,
      keep_alive: "10m",
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    response?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok)
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Ollama returned ${response.status}`,
    );
  if (typeof payload?.response !== "string" || !payload.response.trim())
    throw new Error("Ollama returned no content");
  return payload.response.trim();
}

async function ollamaEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_EMBEDDING_MODEL,
      input: text,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    embeddings?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok)
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Ollama returned ${response.status}`,
    );
  const embedding = Array.isArray(payload?.embeddings)
    ? payload.embeddings[0]
    : null;
  if (
    !Array.isArray(embedding) ||
    !embedding.every((value) => typeof value === "number")
  )
    throw new Error("Ollama returned no embedding");
  return embedding;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return runWithFallback(
    async (client) => {
      const response = await client.models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
      });
      const values = response.embeddings?.[0]?.values;
      if (!values?.length) throw new Error("Gemini returned no embedding");
      return values;
    },
    null,
    () => ollamaEmbedding(text),
  );
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
  const prompt = `${context}\n\nSELECTED PASSAGE:\n${input.selectedText}`;
  const system =
    "Explain only the selected passage. Do not answer unrelated questions. Use clear educational language, preserve important technical terminology, use short paragraphs, and return plain text.";
  return runWithFallback(
    async (client) => {
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${system}\n${prompt}`,
      });
      const text = response.text?.trim();
      if (!text) throw new Error("Gemini returned no explanation");
      return text;
    },
    () => sglangGenerate({ prompt, system }),
    () => ollamaGenerate({ prompt, system }),
  );
}

interface ConceptGraph {
  concepts: Array<{
    label: string;
    description: string;
    pageNumber: number | null;
  }>;
  edges: Array<{ source: string; target: string; relationship: string }>;
}

function parseConceptGraph(raw: string): ConceptGraph {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object")
    throw new Error("Invalid graph response");
  const value = parsed as { concepts?: unknown; edges?: unknown };
  if (!Array.isArray(value.concepts) || !Array.isArray(value.edges))
    throw new Error("Invalid graph response");
  return {
    concepts: value.concepts.slice(0, 30).filter(
      (
        concept,
      ): concept is {
        label: string;
        description: string;
        pageNumber: number | null;
      } =>
        !!concept &&
        typeof concept.label === "string" &&
        typeof concept.description === "string" &&
        (typeof concept.pageNumber === "number" || concept.pageNumber === null),
    ),
    edges: value.edges.filter(
      (
        edge,
      ): edge is { source: string; target: string; relationship: string } =>
        !!edge &&
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        typeof edge.relationship === "string",
    ),
  };
}

export async function extractConceptGraph(input: {
  documentTitle: string;
  chunks: Array<{ content: string; pageNumber: number }>;
}): Promise<ConceptGraph> {
  const prompt = `Extract a knowledge graph from "${input.documentTitle}". Return concepts (maximum 30: label, description, pageNumber) and meaningful edges (source, target, relationship). Every edge label must exactly match a concept label. Use the most relevant page.\n\n${input.chunks.map((chunk) => `[Page ${chunk.pageNumber}] ${chunk.content}`).join("\n\n")}`;
  return runWithFallback(
    async (client) => {
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      const raw = response.text?.trim();
      if (!raw) throw new Error("Gemini returned no graph");
      return parseConceptGraph(raw);
    },
    async () =>
      parseConceptGraph(
        await sglangGenerate({
          prompt,
          system: "Return only a valid JSON object with concepts and edges.",
          json: true,
        }),
      ),
    async () =>
      parseConceptGraph(
        await ollamaGenerate({
          prompt,
          system: "Return only a valid JSON object with concepts and edges.",
          json: true,
        }),
      ),
  );
}
