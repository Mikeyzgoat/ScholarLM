import { createHash } from "node:crypto";
import { db } from "../db/database";

export type ExplanationMode = "explain" | "regenerate" | "simplify";
export type ExplanationInputKind = "text" | "handwriting" | "selection";
export type ExplanationStatus = "pending" | "complete" | "failed";

export interface ExplanationHistoryItem {
  historyId: string;
  selectedText: string;
  explanation: string;
  mode: ExplanationMode;
  pageNumber?: number;
  createdAt: string;
  status: ExplanationStatus;
  error?: string;
}

export function listExplanationHistory(input: {
  noteId?: string;
  canvasId?: string;
  documentId?: string;
  limit?: number;
}): ExplanationHistoryItem[] {
  const scope = input.noteId
    ? { column: "note_id", value: input.noteId }
    : input.canvasId
      ? { column: "canvas_id", value: input.canvasId }
      : input.documentId
        ? { column: "document_id", value: input.documentId }
      : null;
  if (!scope) return [];
  const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 100)));
  return db
    .query(
      `SELECT id historyId,selected_text selectedText,explanation,
              prompt_mode mode,page_number pageNumber,created_at createdAt,
              status,error_message error
       FROM explanation_history
       WHERE ${scope.column}=?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(scope.value, limit) as ExplanationHistoryItem[];
}

function selectionHash(input: {
  selectedText: string;
  documentId?: string;
  canvasId?: string;
  shapeId?: string;
  imageFingerprint?: string;
  documentTitle?: string;
  pageNumber?: number;
}): string {
  const parts: Array<string | number> = [
    input.documentId?.trim() ?? "",
    input.canvasId?.trim() ?? "",
    input.shapeId?.trim() ?? "",
    input.documentTitle?.trim() ?? "",
    input.pageNumber ?? "",
    input.selectedText.trim().replace(/\s+/g, " "),
  ];
  if (input.imageFingerprint) parts.push(input.imageFingerprint.trim());
  return createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex");
}

export function findLatestExplanation(input: {
  selectedText: string;
  documentId?: string;
  canvasId?: string;
  shapeId?: string;
  imageFingerprint?: string;
  documentTitle?: string;
  pageNumber?: number;
}): {
  explanation: string;
  voiceExplanation?: string;
  intent?: "theory" | "math" | "problem-solving" | "general";
  recognizedEquation?: string;
  historyId: string;
  revisionCount: number;
} | null {
  const hash = selectionHash(input);
  const row = db
    .query(
      `SELECT id historyId,explanation,voice_explanation voiceExplanation,intent,recognized_text recognizedEquation
       FROM explanation_history
       WHERE selection_hash=? AND status='complete'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(hash) as {
    historyId: string;
    explanation: string;
    voiceExplanation: string | null;
    intent: "theory" | "math" | "problem-solving" | "general" | null;
    recognizedEquation: string | null;
  } | null;
  if (!row) return null;
  const revisionCount = (
    db
      .query(
        "SELECT COUNT(*) count FROM explanation_history WHERE selection_hash=? AND status='complete'",
      )
      .get(hash) as { count: number }
  ).count;
  return {
    explanation: row.explanation,
    voiceExplanation: row.voiceExplanation ?? undefined,
    intent: row.intent ?? undefined,
    recognizedEquation: row.recognizedEquation ?? undefined,
    historyId: row.historyId,
    revisionCount,
  };
}

export function storeExplanationRevision(input: {
  selectedText: string;
  documentId?: string;
  noteId?: string;
  canvasId?: string;
  shapeId?: string;
  shapeIds?: string[];
  imageFingerprint?: string;
  documentTitle?: string;
  pageNumber?: number;
  mode: ExplanationMode;
  explanation: string;
  voiceExplanation?: string;
  intent?: "theory" | "math" | "problem-solving" | "general";
  recognizedText?: string;
  inputKind?: ExplanationInputKind;
  requestId: string;
  status?: ExplanationStatus;
  errorMessage?: string;
}): { historyId: string; revisionCount: number } {
  const hash = selectionHash(input);
  const historyId = input.requestId;
  db.query(
    `INSERT INTO explanation_history
     (id,selection_hash,selected_text,document_id,note_id,document_title,page_number,prompt_mode,explanation,voice_explanation,intent,created_at,status,error_message)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       explanation=excluded.explanation,voice_explanation=excluded.voice_explanation,
       intent=excluded.intent,status=excluded.status,error_message=excluded.error_message`,
  ).run(
    historyId,
    hash,
    input.selectedText.trim(),
    input.documentId?.trim() || null,
    input.noteId?.trim() || null,
    input.documentTitle?.trim() || null,
    input.pageNumber ?? null,
    input.mode,
    input.explanation.trim(),
    input.voiceExplanation?.trim() || null,
    input.intent ?? null,
    new Date().toISOString(),
    input.status ?? "complete",
    input.errorMessage?.slice(0, 1000) ?? null,
  );
  db.query(
    `UPDATE explanation_history
     SET recognized_text=?,input_kind=?,canvas_id=?,shape_id=?
     WHERE id=?`,
  ).run(
    input.recognizedText?.trim() || null,
    input.inputKind ?? "text",
    input.canvasId?.trim() || null,
    input.shapeId?.trim() || null,
    historyId,
  );
  const sourceShapeIds = [
    ...new Set(
      [input.shapeId, ...(input.shapeIds ?? [])].filter(
        (value): value is string => Boolean(value?.trim()),
      ),
    ),
  ];
  sourceShapeIds.forEach((shapeId) => {
    db.query(
      `INSERT OR IGNORE INTO explanation_sources
       (explanation_id,shape_id,note_id,canvas_id)
       VALUES (?,?,?,?)`,
    ).run(
      historyId,
      shapeId,
      input.noteId?.trim() || null,
      input.canvasId?.trim() || null,
    );
  });
  const revisionCount = (
    db
      .query(
        "SELECT COUNT(*) count FROM explanation_history WHERE selection_hash=? AND status='complete'",
      )
      .get(hash) as { count: number }
  ).count;
  return { historyId, revisionCount };
}

export function failExplanationRevision(id: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Explanation failed";
  db.query(
    "UPDATE explanation_history SET status='failed',error_message=? WHERE id=?",
  ).run(message.slice(0, 1000), id);
}

export function deleteFailedExplanation(id: string): boolean {
  return db
    .query("DELETE FROM explanation_history WHERE id=? AND status='failed'")
    .run(id).changes > 0;
}
