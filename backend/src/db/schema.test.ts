import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeSchema } from "./schema";

describe("explanation persistence", () => {
  test("stores generation status and prefers available OpenRouter audio", () => {
    const db = new Database(":memory:");
    initializeSchema(db);
    const now = new Date().toISOString();
    db.query(
      `INSERT INTO explanation_history
       (id,selection_hash,selected_text,prompt_mode,explanation,created_at,status)
       VALUES (?,?,?,?,?,?,?)`,
    ).run("explanation", "selection", "question", "explain", "answer", now, "complete");
    const insert = db.query(
      "INSERT INTO explanation_audio_variants VALUES (?,?,?,?,?,?)",
    );
    insert.run("explanation", "kokoro", new Uint8Array([1]), "audio/wav", now, now);
    const pick = () =>
      db
        .query(
          `SELECT provider FROM explanation_audio_variants
           WHERE explanation_id=?
           ORDER BY CASE provider WHEN 'fish-audio' THEN 0 ELSE 1 END
           LIMIT 1`,
        )
        .get("explanation") as { provider: string };
    expect(pick().provider).toBe("kokoro");
    insert.run("explanation", "fish-audio", new Uint8Array([2]), "audio/mpeg", now, now);
    expect(pick().provider).toBe("fish-audio");
    db.close();
  });
});
