import { createHash } from "node:crypto";
import { db } from "../db/database";

export type ExplanationMode = "explain" | "regenerate" | "simplify";
export type ExplanationInputKind = "text" | "handwriting" | "selection";

function selectionHash(input: {
  selectedText: string;
  documentId?: string;
  canvasId?: string;
  shapeId?: string;
  documentTitle?: string;
  pageNumber?: number;
}): string {
  return createHash("sha256")
    .update(
      [
        input.documentId?.trim() ?? "",
        input.canvasId?.trim() ?? "",
        input.shapeId?.trim() ?? "",
        input.documentTitle?.trim() ?? "",
        input.pageNumber ?? "",
        input.selectedText.trim().replace(/\s+/g, " "),
      ].join("\u001f"),
    )
    .digest("hex");
}

export function storeExplanationRevision(input: {
  selectedText: string;
  documentId?: string;
  noteId?: string;
  canvasId?: string;
  shapeId?: string;
  documentTitle?: string;
  pageNumber?: number;
  mode: ExplanationMode;
  explanation: string;
  recognizedText?: string;
  inputKind?: ExplanationInputKind;
  requestId: string;
}): { historyId: string; revisionCount: number } {
  const hash = selectionHash(input);
  const historyId = input.requestId;
  db.query(
    `INSERT INTO explanation_history
     (id,selection_hash,selected_text,document_id,note_id,document_title,page_number,prompt_mode,explanation,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
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
  const revisionCount = (
    db
      .query(
        "SELECT COUNT(*) count FROM explanation_history WHERE selection_hash=?",
      )
      .get(hash) as { count: number }
  ).count;
  return { historyId, revisionCount };
}
