import app from "./index";
import { env } from "./env";
import { backfillMissingExplanationAudio } from "./services/speechBackfill";

const server = Bun.serve({
  port: env.BACKEND_PORT,
  fetch: app.fetch,
});

console.log(`ScholarLM API listening on ${server.url}`);

setTimeout(() => {
  void backfillMissingExplanationAudio(10)
    .then((result) => {
      if (result.processed || result.failed)
        console.log("[tts] Explanation audio backfill", result);
    })
    .catch((error) =>
      console.error("[tts] Explanation audio backfill failed", error),
    );
}, 2_000);
