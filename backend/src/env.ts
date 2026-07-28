const key = Bun.env.GEMINI_API_KEY?.trim() ?? "";
if (!key) throw new Error("GEMINI_API_KEY is required");
const port = Number(Bun.env.BACKEND_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("BACKEND_PORT must be a valid port");
export const env: { GEMINI_API_KEY: string; BACKEND_PORT: number; FRONTEND_ORIGIN: string } = {
  GEMINI_API_KEY: key,
  BACKEND_PORT: port,
  FRONTEND_ORIGIN: Bun.env.FRONTEND_ORIGIN?.trim() || "http://localhost:3000",
};
