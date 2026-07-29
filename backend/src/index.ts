import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { initializeDatabase, prepareEmbeddingModel } from "./db/database";
import { ensureUploadDirectory } from "./utils/files";
import documents from "./routes/documents";
import search from "./routes/search";
import explanation from "./routes/explanation";
import speech from "./routes/speech";
import graph from "./routes/graph";
import notes from "./routes/notes";
import rag from "./routes/rag";
import { resumePendingIngestions } from "./services/ingestion";
import { getProviderStatus } from "./services/providerTelemetry";
initializeDatabase();
if (env.OPENROUTER_API_KEY)
  prepareEmbeddingModel(env.OPENROUTER_EMBEDDING_MODEL);
await ensureUploadDirectory();
void resumePendingIngestions();
const app = new Hono({ strict: false });
app.use("*", cors({ origin: env.FRONTEND_ORIGIN }));
app.get("/health", (c) =>
  c.json({ ok: true, providers: { openrouter: getProviderStatus() } }),
);
app.route("/documents", documents);
app.route("/search", search);
app.route("/explain", explanation);
app.route("/tts", speech);
app.route("/graph", graph);
app.route("/notes", notes);
app.route("/qa", rag);
app.notFound((c) =>
  c.json({ error: { message: "Route not found", code: "NOT_FOUND" } }, 404),
);
app.onError((error, c) => {
  console.error(error);
  return c.json(
    { error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
    500,
  );
});
export default app;
