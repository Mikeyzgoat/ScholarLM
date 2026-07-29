import { db } from "../db/database";
import { synthesizeSpeech } from "./speech";
import {
  getCachedSpeech,
  linkExplanationSpeech,
  storeCachedSpeech,
} from "./speechCache";

interface MissingExplanationAudio {
  id: string;
  selected_text: string;
  explanation: string;
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
      `SELECT eh.id,eh.selected_text,eh.explanation
       FROM explanation_history eh
       LEFT JOIN explanation_audio ea ON ea.explanation_id=eh.id
       WHERE ea.explanation_id IS NULL
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
      const cached = getCachedSpeech(row.explanation);
      if (cached) {
        linkExplanationSpeech(row.id, row.explanation);
        result.linkedFromCache += 1;
      } else {
        const audio = await synthesizeSpeech(row.explanation);
        storeCachedSpeech(row.explanation, audio, row.selected_text);
        linkExplanationSpeech(row.id, row.explanation);
        result.generated += 1;
      }
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
         LEFT JOIN explanation_audio ea ON ea.explanation_id=eh.id
         WHERE ea.explanation_id IS NULL`,
      )
      .get() as { count: number }
  ).count;
  return result;
}
