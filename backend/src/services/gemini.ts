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
  if (!env.SGLANG_BASE_URL || !env.SGLANG_MODEL)
    failures.push("SGLang fallback is not configured");
  throw new Error(`AI providers unavailable. ${failures.join(" | ")}`);
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
      stream: true,
      temperature: 0.2,
      response_format: input.json ? { type: "json_object" } : undefined,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  return readSglangStream(response);
}

async function readSglangStream(response: Response): Promise<string> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: unknown };
    } | null;
    throw new Error(
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `SGLang returned ${response.status}`,
    );
  }
  if (!response.body) throw new Error("SGLang returned no response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const part = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown } }>;
    };
    const token = part.choices?.[0]?.delta?.content;
    if (typeof token === "string") content += token;
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);
  if (!content.trim()) throw new Error("SGLang returned no content");
  return content.trim();
}

interface CanvasAnalysis {
  explanation: string;
  recognizedEquation?: string;
  plot?: {
    title: string;
    xLabel: string;
    yLabel: string;
    points: Array<{ x: number; y: number }>;
  };
}

function parseCanvasAnalysis(raw: string): CanvasAnalysis {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const value = JSON.parse(cleaned) as Partial<CanvasAnalysis>;
  if (typeof value.explanation !== "string" || !value.explanation.trim())
    throw new Error("AI returned an invalid handwritten-math explanation");
  const points = value.plot?.points
    ?.filter(
      (point) =>
        Number.isFinite(point?.x) &&
        Number.isFinite(point?.y),
    )
    .slice(0, 80);
  return {
    explanation: value.explanation.trim(),
    recognizedEquation:
      typeof value.recognizedEquation === "string"
        ? value.recognizedEquation.trim()
        : undefined,
    plot:
      value.plot &&
      typeof value.plot.title === "string" &&
      points &&
      points.length >= 2
        ? {
            title: value.plot.title,
            xLabel:
              typeof value.plot.xLabel === "string" ? value.plot.xLabel : "x",
            yLabel:
              typeof value.plot.yLabel === "string" ? value.plot.yLabel : "y",
            points,
          }
        : undefined,
  };
}

export async function explainCanvasSelection(input: {
  imageDataUrl?: string;
  selectedText?: string;
  documentTitle?: string;
  pageNumber?: number;
  graphRequested?: boolean;
}): Promise<CanvasAnalysis> {
  const imageBase64 = input.imageDataUrl?.slice(
    input.imageDataUrl.indexOf(",") + 1,
  );
  const prompt = `Analyze the selected mathematics${input.imageDataUrl ? " in the image" : ""}.
Recognize the equation accurately, solve it step by step, and explain the reasoning as a teacher.
Provide 17–41 ordered sample points across a useful domain when a graph materially helps the explanation${input.graphRequested ? " or because the user explicitly requested a graph" : ""}. Otherwise omit plot. If a requested graph is mathematically inapplicable, explain why instead of inventing one.
Return only JSON:
{"recognizedEquation":"...","explanation":"...","plot":{"title":"...","xLabel":"x","yLabel":"y","points":[{"x":-2,"y":4}]}}
${input.documentTitle ? `Document context: ${input.documentTitle}` : ""}
${input.pageNumber ? `Page: ${input.pageNumber}` : ""}
${input.selectedText ? `Associated text: ${input.selectedText}` : ""}`;
  const system =
    "You are a mathematics teacher with visual handwriting recognition. Never invent unreadable symbols: state uncertainty in the explanation. Return valid JSON only.";
  return runWithFallback(
    async (client) => {
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: `${system}\n${prompt}` },
              ...(imageBase64
                ? [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: imageBase64,
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        config: { responseMimeType: "application/json" },
      });
      const raw = response.text?.trim();
      if (!raw) throw new Error("Gemini returned no visual analysis");
      return parseCanvasAnalysis(raw);
    },
    env.SGLANG_BASE_URL && env.SGLANG_MODEL
      ? async () => {
          const response = await fetch(
            `${env.SGLANG_BASE_URL}/v1/chat/completions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: env.SGLANG_MODEL,
                messages: [
                  { role: "system", content: system },
                  {
                    role: "user",
                    content: [
                      { type: "text", text: prompt },
                      ...(input.imageDataUrl
                        ? [
                            {
                              type: "image_url",
                              image_url: { url: input.imageDataUrl },
                            },
                          ]
                        : []),
                    ],
                  },
                ],
                temperature: 0.1,
                stream: true,
                chat_template_kwargs: { enable_thinking: false },
              }),
            },
          );
          return parseCanvasAnalysis(await readSglangStream(response));
        }
      : null,
  );
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
  return ollamaEmbedding(text);
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
  );
}
