import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { initializeSchema } from "./schema";
const dataDir = resolve(import.meta.dir, "../../data");
mkdirSync(dataDir, { recursive: true });
export const db = new Database(resolve(dataDir, "scholarlm.sqlite"), {
  create: true,
});
let initialized = false;
export function initializeDatabase(): void {
  if (initialized) return;
  db.exec("PRAGMA foreign_keys = ON;");
  initializeSchema(db);
  initialized = true;
}

export function prepareEmbeddingModel(model: string): void {
  const key = "embedding_model";
  const current = db
    .query("SELECT value FROM runtime_metadata WHERE key=?")
    .get(key) as { value: string } | null;
  if (current?.value === model) return;
  const hasEmbeddings = (
    db
      .query("SELECT EXISTS(SELECT 1 FROM chunks WHERE embedding IS NOT NULL) present")
      .get() as { present: number }
  ).present;
  db.transaction(() => {
    if (hasEmbeddings) {
      db.exec("UPDATE chunks SET embedding=NULL;");
      db.exec("DELETE FROM sticky_note_index;");
      db.query(
        "UPDATE documents SET status='embedding',error_message=NULL,updated_at=? WHERE status='ready'",
      ).run(new Date().toISOString());
    }
    db.query(
      "INSERT INTO runtime_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(key, model);
  })();
}
