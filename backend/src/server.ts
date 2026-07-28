import app from "./index";
import { env } from "./env";

const server = Bun.serve({
  port: env.BACKEND_PORT,
  fetch: app.fetch,
});

console.log(`ScholarLM API listening on ${server.url}`);
