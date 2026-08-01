import app from "./index";
import { env } from "./env";
import { backfillMissingExplanationAudio } from "./services/speechBackfill";
import { warmSpeechModel } from "./services/speech";

const server = Bun.serve({
  port: env.BACKEND_PORT,
  fetch: app.fetch,
  idleTimeout: 120,
});

console.log(`ScholarLM API listening on ${server.url}`);

void warmSpeechModel()
  .then(() => console.log("[tts] Kokoro fallback is loaded and ready"))
  .catch((error) =>
    console.warn(
      "[tts] Kokoro preload failed; Fish Audio remains available",
      error,
    ),
  );

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
