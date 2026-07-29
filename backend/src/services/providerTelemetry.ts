import { createHash, randomUUID } from "node:crypto";
import { db } from "../db/database";
import { env } from "../env";

export function beginOpenRouterRequest(operation: string): string {
  const now = new Date().toISOString();
  const id = createHash("sha256")
    .update(`${operation}\u001f${now}\u001f${randomUUID()}`)
    .digest("hex");
  db.query(
    "INSERT INTO openrouter_requests(id,operation,model,status,created_at) VALUES(?,?,?,?,?)",
  ).run(id, operation, env.OPENROUTER_MODEL, "pending", now);
  return id;
}

export function finishOpenRouterRequest(id: string): void {
  db.query(
    "UPDATE openrouter_requests SET status='success',completed_at=? WHERE id=?",
  ).run(new Date().toISOString(), id);
}

export function failOpenRouterRequest(id: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  const normalized = message.toLowerCase();
  const code = /quota|limit|credit|balance|payment/.test(normalized)
    ? "USAGE_LIMIT"
    : /unauthorized|api key|401|403/.test(normalized)
      ? "AUTH"
      : /timeout|timed out/.test(normalized)
        ? "TIMEOUT"
        : "OUTAGE";
  db.query(
    "UPDATE openrouter_requests SET status='failed',error_code=?,error_message=?,completed_at=? WHERE id=?",
  ).run(code, message.slice(0, 1000), new Date().toISOString(), id);
}

export function getProviderStatus() {
  const recent = db
    .query(
      "SELECT status,error_code,error_message,created_at FROM openrouter_requests ORDER BY created_at DESC LIMIT 50",
    )
    .all() as Array<{
    status: string;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  const failures = recent.filter((row) => row.status === "failed");
  const latestFailure = failures[0];
  const warning =
    latestFailure?.error_code === "USAGE_LIMIT"
      ? "OpenRouter usage or credit limit may be exhausted."
      : latestFailure?.error_code === "AUTH"
        ? "OpenRouter API key requires attention."
        : failures.length >= 3
          ? "OpenRouter is experiencing repeated failures."
          : null;
  return {
    configured: Boolean(env.OPENROUTER_API_KEY),
    model: env.OPENROUTER_MODEL,
    status: warning ? "warning" : "healthy",
    warning,
    recentRequests: recent.length,
    recentFailures: failures.length,
    lastError: latestFailure?.error_message ?? null,
  };
}
