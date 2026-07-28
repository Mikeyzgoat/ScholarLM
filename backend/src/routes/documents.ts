import { Hono } from "hono";
import { db } from "../db/database";
import { createId } from "../utils/ids";
import { deleteFileIfExists, saveUploadedPdf } from "../utils/files";
import type { DocumentRecord } from "../types";
import { ingestDocument } from "../services/ingestion";
import { createHash } from "node:crypto";
const documents = new Hono();
const summary = (d: DocumentRecord) => ({
  id: d.id,
  name: d.name,
  originalName: d.original_name,
  status: d.status,
  pageCount: d.page_count,
  errorMessage: d.error_message,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});
documents.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File))
    return c.json(
      { error: { message: "PDF file is required", code: "INVALID_FILE" } },
      400,
    );
  if (file.size > 50 * 1024 * 1024)
    return c.json(
      {
        error: {
          message: "PDF must be 50 MB or smaller",
          code: "FILE_TOO_LARGE",
        },
      },
      400,
    );
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  )
    return c.json(
      {
        error: {
          message: "Only PDF files are supported",
          code: "INVALID_FILE_TYPE",
        },
      },
      400,
    );
  const contentHash = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  const duplicate = db
    .query("SELECT * FROM documents WHERE content_hash=?")
    .get(contentHash) as DocumentRecord | null;
  if (duplicate)
    return c.json(
      { document: { ...summary(duplicate), duplicate: true } },
      200,
    );
  const id = createId(),
    now = new Date().toISOString();
  let path = "";
  try {
    path = await saveUploadedPdf(file, id);
    db.query(
      "INSERT INTO documents (id,name,original_name,file_path,mime_type,size_bytes,content_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      file.name.replace(/\.pdf$/i, ""),
      file.name,
      path,
      file.type || "application/pdf",
      file.size,
      contentHash,
      "uploaded",
      now,
      now,
    );
  } catch (e) {
    if (path) await deleteFileIfExists(path);
    throw e;
  }
  void ingestDocument(id);
  const row = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(id) as DocumentRecord;
  return c.json({ document: summary(row) }, 201);
});
documents.get("/", (c) => {
  const rows = db
    .query("SELECT * FROM documents ORDER BY created_at DESC")
    .all() as DocumentRecord[];
  return c.json({ documents: rows.map(summary) });
});
documents.get("/:id/status", (c) => {
  const id = c.req.param("id");
  if (!id)
    return c.json(
      { error: { message: "Document ID is required", code: "INVALID_ID" } },
      400,
    );
  const d = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(id) as DocumentRecord | null;
  if (!d)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  return c.json({
    id: d.id,
    status: d.status,
    errorMessage: d.error_message,
    pageCount: d.page_count,
    updatedAt: d.updated_at,
  });
});
documents.get("/:id/file", (c) => {
  const d = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(c.req.param("id")) as DocumentRecord | null;
  if (!d || !Bun.file(d.file_path).size)
    return c.json(
      { error: { message: "Document file not found", code: "NOT_FOUND" } },
      404,
    );
  return new Response(Bun.file(d.file_path), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${d.original_name.replaceAll('"', "")}"`,
    },
  });
});
documents.get("/:id", (c) => {
  const d = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(c.req.param("id")) as DocumentRecord | null;
  return d
    ? c.json({ document: summary(d) })
    : c.json(
        { error: { message: "Document not found", code: "NOT_FOUND" } },
        404,
      );
});
export default documents;
