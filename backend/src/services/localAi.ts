import { env } from "../env";

async function ollamaGenerate(input: {
  prompt: string;
  system?: string;
  json?: boolean;
  imageDataUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const image = input.imageDataUrl?.replace(/^data:image\/[^;]+;base64,/, "");
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_GENERATION_MODEL,
      messages: [
        ...(input.system ? [{ role: "system", content: input.system }] : []),
        {
          role: "user",
          content: input.prompt,
          images: image ? [image] : undefined,
        },
      ],
      stream: true,
      think: false,
      keep_alive: "10m",
      format: input.json ? "json" : undefined,
      options: {
        temperature: 0.2,
        num_ctx: 4096,
      },
    }),
    signal: input.signal,
  });
  return readOllamaStream(response);
}

async function readOllamaStream(response: Response): Promise<string> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Ollama returned ${response.status}`,
    );
  }
  if (!response.body) throw new Error("Ollama returned no response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    const part = JSON.parse(line) as {
      message?: { content?: unknown };
      error?: unknown;
    };
    if (typeof part.error === "string") throw new Error(part.error);
    const token = part.message?.content;
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
  if (!content.trim()) throw new Error("Ollama returned no content");
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
  signal?: AbortSignal;
}): Promise<CanvasAnalysis> {
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
  return parseCanvasAnalysis(
    await ollamaGenerate({
      prompt,
      system,
      json: true,
      imageDataUrl: input.imageDataUrl,
      signal: input.signal,
    }),
  );
}

export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_EMBEDDING_MODEL,
      input: texts,
      keep_alive: "10m",
    }),
    signal: AbortSignal.timeout(120_000),
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
  const embeddings = payload?.embeddings;
  if (
    !Array.isArray(embeddings) ||
    embeddings.length !== texts.length ||
    !embeddings.every(
      (embedding) =>
        Array.isArray(embedding) &&
        embedding.every((value) => typeof value === "number"),
    )
  )
    throw new Error("Ollama returned invalid embeddings");
  return embeddings as number[][];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return (await generateEmbeddings([text]))[0];
}

export async function explainSelectedText(input: {
  selectedText: string;
  documentTitle?: string;
  pageNumber?: number;
  signal?: AbortSignal;
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
  return ollamaGenerate({ prompt, system, signal: input.signal });
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
  return parseConceptGraph(
    await ollamaGenerate({
      prompt,
      system: "Return only a valid JSON object with concepts and edges.",
      json: true,
    }),
  );
}
