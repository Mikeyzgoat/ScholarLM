const port = Number(Bun.env.BACKEND_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("BACKEND_PORT must be a valid port");
export const env: {
  BACKEND_PORT: number;
  FRONTEND_ORIGIN: string;
  OLLAMA_BASE_URL: string;
  OLLAMA_EMBEDDING_MODEL: string;
  SGLANG_BASE_URL: string;
  SGLANG_MODEL: string;
} = {
  BACKEND_PORT: port,
  FRONTEND_ORIGIN: Bun.env.FRONTEND_ORIGIN?.trim() || "http://localhost:3000",
  OLLAMA_BASE_URL:
    Bun.env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:11434",
  OLLAMA_EMBEDDING_MODEL:
    Bun.env.OLLAMA_EMBEDDING_MODEL?.trim() || "nomic-embed-text",
  SGLANG_BASE_URL:
    Bun.env.SGLANG_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:30000",
  SGLANG_MODEL:
    Bun.env.SGLANG_MODEL?.trim() || "google/gemma-4-E2B-it",
};
