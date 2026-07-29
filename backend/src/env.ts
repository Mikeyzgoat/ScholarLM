const port = Number(Bun.env.BACKEND_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("BACKEND_PORT must be a valid port");
export const env: {
  BACKEND_PORT: number;
  FRONTEND_ORIGIN: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_EMBEDDING_MODEL: string;
  OPENROUTER_ROUTING_MODELS: string[];
  OPENROUTER_MAX_INPUT_PRICE: number;
  OPENROUTER_MAX_OUTPUT_PRICE: number;
} = {
  BACKEND_PORT: port,
  FRONTEND_ORIGIN: Bun.env.FRONTEND_ORIGIN?.trim() || "http://localhost:3000",
  OPENROUTER_API_KEY: Bun.env.OPENROUTER_API_KEY?.trim() || "",
  OPENROUTER_BASE_URL:
    Bun.env.OPENROUTER_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://openrouter.ai/api/v1",
  OPENROUTER_MODEL:
    Bun.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
  OPENROUTER_EMBEDDING_MODEL:
    Bun.env.OPENROUTER_EMBEDDING_MODEL?.trim() ||
    "nvidia/nemotron-3-embed-1b:free",
  OPENROUTER_ROUTING_MODELS: (
    Bun.env.OPENROUTER_ROUTING_MODELS ||
    "qwen/qwen3.5-flash-02-23,google/gemma-4-26b-a4b-it:free,google/gemma-4-26b-a4b-it,bytedance-seed/seed-1.6-flash,mistralai/mistral-small-3.2-24b-instruct"
  )
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean),
  OPENROUTER_MAX_INPUT_PRICE: Number(
    Bun.env.OPENROUTER_MAX_INPUT_PRICE || "0.2",
  ),
  OPENROUTER_MAX_OUTPUT_PRICE: Number(
    Bun.env.OPENROUTER_MAX_OUTPUT_PRICE || "0.4",
  ),
};
