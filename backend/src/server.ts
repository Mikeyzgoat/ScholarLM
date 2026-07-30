import app from "./index";
import { env } from "./env";
import { backfillMissingExplanationAudio } from "./services/speechBackfill";
import { warmSpeechModel } from "./services/speech";

try {
  await warmSpeechModel();
  console.log("[tts] Kokoro is loaded and ready");
} catch (error) {
  console.error(
    "[tts] Kokoro preload failed; browser speech fallback remains available",
    error,
  );
}

const server = Bun.serve({
  port: env.BACKEND_PORT,
  fetch: app.fetch,
  idleTimeout: 120,
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
