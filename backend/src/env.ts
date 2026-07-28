const keys = (
  Bun.env.GEMINI_API_TOKENS ||
  Bun.env.GEMINI_API_TOKEN ||
  Bun.env.GEMINI_API_KEY ||
  ""
)
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const port = Number(Bun.env.BACKEND_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("BACKEND_PORT must be a valid port");
export const env: {
  GEMINI_API_KEY: string;
  GEMINI_API_KEYS: string[];
  BACKEND_PORT: number;
  FRONTEND_ORIGIN: string;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_EMBEDDING_MODEL: string;
  SGLANG_BASE_URL: string;
  SGLANG_MODEL: string;
} = {
  GEMINI_API_KEY: keys[0] ?? "",
  GEMINI_API_KEYS: keys,
  BACKEND_PORT: port,
  FRONTEND_ORIGIN: Bun.env.FRONTEND_ORIGIN?.trim() || "http://localhost:3000",
  OLLAMA_BASE_URL:
    Bun.env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:11434",
  OLLAMA_MODEL: Bun.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
  OLLAMA_EMBEDDING_MODEL:
    Bun.env.OLLAMA_EMBEDDING_MODEL?.trim() || "nomic-embed-text",
  SGLANG_BASE_URL: Bun.env.SGLANG_BASE_URL?.trim().replace(/\/$/, "") || "",
  SGLANG_MODEL: Bun.env.SGLANG_MODEL?.trim() || "",
};
