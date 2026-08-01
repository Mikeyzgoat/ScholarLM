import { createHash } from "node:crypto";
import { db } from "../db/database";

export type ExplanationMode = "explain" | "regenerate" | "simplify";
export type ExplanationInputKind = "text" | "handwriting" | "selection";

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
  recognizedEquation?: string;
  historyId: string;
  revisionCount: number;
} | null {
  const hash = selectionHash(input);
  const row = db
    .query(
      `SELECT id historyId,explanation,voice_explanation voiceExplanation,recognized_text recognizedEquation
       FROM explanation_history
       WHERE selection_hash=?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(hash) as {
    historyId: string;
    explanation: string;
    voiceExplanation: string | null;\r\n    voiceExplanation: string | null;
    recognizedEquation: string | null;
  } | null;
  if (!row) return null;
  const revisionCount = (
    db
      .query(
        "SELECT COUNT(*) count FROM explanation_history WHERE selection_hash=?",
      )
      .get(hash) as { count: number }
  ).count;
  return {
    explanation: row.explanation,
    voiceExplanation: row.voiceExplanation ?? undefined,
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
  recognizedText?: string;
  inputKind?: ExplanationInputKind;
  requestId: string;
}): { historyId: string; revisionCount: number } {
  const hash = selectionHash(input);
  const historyId = input.requestId;
  db.query(
    `INSERT INTO explanation_history
     (id,selection_hash,selected_text,document_id,note_id,document_title,page_number,prompt_mode,explanation,voice_explanation,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
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
    new Date().toISOString(),
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
        "SELECT COUNT(*) count FROM explanation_history WHERE selection_hash=?",
      )
      .get(hash) as { count: number }
  ).count;
  return { historyId, revisionCount };
}



