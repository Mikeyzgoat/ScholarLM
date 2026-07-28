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
