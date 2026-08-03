import { db } from "../db/database";
import { prepareExplanationSpeechVariants } from "./explanationSpeech";

interface MissingExplanationAudio {
  id: string;
  selected_text: string;
  explanation: string;
  voice_explanation: string | null;
}

export interface SpeechBackfillResult {
  processed: number;
  generated: number;
  linkedFromCache: number;
  failed: number;
  remaining: number;
}

export async function backfillMissingExplanationAudio(
  limit = 10,
): Promise<SpeechBackfillResult> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = db
    .query(
      `SELECT eh.id,eh.selected_text,eh.explanation,eh.voice_explanation
       FROM explanation_history eh
       WHERE eh.status='complete' AND (
         NOT EXISTS (SELECT 1 FROM explanation_audio_variants v WHERE v.explanation_id=eh.id AND v.provider='fish-audio')
         OR NOT EXISTS (SELECT 1 FROM explanation_audio_variants v WHERE v.explanation_id=eh.id AND v.provider='kokoro')
       )
       ORDER BY eh.created_at DESC
       LIMIT ?`,
    )
    .all(safeLimit) as MissingExplanationAudio[];
  const result: SpeechBackfillResult = {
    processed: 0,
    generated: 0,
    linkedFromCache: 0,
    failed: 0,
    remaining: 0,
  };
  for (const row of rows) {
    try {
      const speechText = row.voice_explanation?.trim() || row.explanation;
      await prepareExplanationSpeechVariants({
        explanationId: row.id,
        text: speechText,
        sourceText: row.selected_text,
      });
      result.generated += 1;
      result.processed += 1;
    } catch (error) {
      result.failed += 1;
      console.error(`[tts] Could not backfill explanation ${row.id}`, error);
    }
  }
  result.remaining = (
    db
      .query(
        `SELECT COUNT(*) count
         FROM explanation_history eh
         WHERE eh.status='complete' AND (
           NOT EXISTS (SELECT 1 FROM explanation_audio_variants v WHERE v.explanation_id=eh.id AND v.provider='fish-audio')
           OR NOT EXISTS (SELECT 1 FROM explanation_audio_variants v WHERE v.explanation_id=eh.id AND v.provider='kokoro')
         )`,
      )
      .get() as { count: number }
  ).count;
  return result;
}
