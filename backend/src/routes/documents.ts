import { Hono } from "hono";
import { db } from "../db/database";
import { createId } from "../utils/ids";
import { deleteFileIfExists, saveUploadedPdf } from "../utils/files";
import type { DocumentRecord } from "../types";
import { ingestDocument } from "../services/ingestion";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { getKnowledgeGraph } from "../services/knowledgeGraph";
import { removeManualGraphNodes } from "../services/manualGraph";
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
  let duplicate = db
    .query("SELECT * FROM documents WHERE content_hash=?")
    .get(contentHash) as DocumentRecord | null;
  if (!duplicate) {
    const unhashedCandidates = db
      .query(
        "SELECT * FROM documents WHERE content_hash IS NULL AND size_bytes=?",
      )
      .all(file.size) as DocumentRecord[];
    for (const candidate of unhashedCandidates) {
      const storedFile = Bun.file(candidate.file_path);
      if (!(await storedFile.exists())) continue;
      const storedHash = createHash("sha256")
        .update(Buffer.from(await storedFile.arrayBuffer()))
        .digest("hex");
      if (storedHash !== contentHash) continue;
      db.query("UPDATE documents SET content_hash=? WHERE id=?").run(
        contentHash,
        candidate.id,
      );
      duplicate = candidate;
      break;
    }
  }
  if (duplicate) return c.json({ document: summary(duplicate) }, 200);
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
  setTimeout(() => void ingestDocument(id), 500);
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
function getGroupedDocuments(groupId: string) {
  return db
    .query(
      `SELECT d.*
       FROM manual_graph_group_members m
       JOIN manual_graph_groups g ON g.id=m.group_id
       JOIN documents d ON d.id=substr(m.node_id,8)
       WHERE m.group_id=? AND g.scope_key='global'
         AND m.node_id LIKE 'source:%'
       ORDER BY m.rowid`,
    )
    .all(groupId) as DocumentRecord[];
}
documents.get("/groups/:groupId", (c) => {
  const groupId = c.req.param("groupId");
  const group = db
    .query(
      "SELECT id,name,color FROM manual_graph_groups WHERE id=? AND scope_key='global'",
    )
    .get(groupId) as { id: string; name: string; color: string } | null;
  const groupedDocuments = getGroupedDocuments(groupId);
  if (!group || groupedDocuments.length < 2)
    return c.json(
      { error: { message: "Document group not found", code: "NOT_FOUND" } },
      404,
    );
  return c.json({
    group: {
      ...group,
      pageCount: groupedDocuments.reduce(
        (total, document) => total + (document.page_count ?? 0),
        0,
      ),
      documents: groupedDocuments.map(summary),
    },
  });
});
documents.get("/groups/:groupId/file", async (c) => {
  const groupId = c.req.param("groupId");
  const group = db
    .query(
      "SELECT name FROM manual_graph_groups WHERE id=? AND scope_key='global'",
    )
    .get(groupId) as { name: string } | null;
  const groupedDocuments = getGroupedDocuments(groupId);
  if (!group || groupedDocuments.length < 2)
    return c.json(
      { error: { message: "Document group not found", code: "NOT_FOUND" } },
      404,
    );
  const combined = await PDFDocument.create();
  for (const document of groupedDocuments) {
    const source = await PDFDocument.load(
      await Bun.file(document.file_path).arrayBuffer(),
    );
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }
  const bytes = await combined.save();
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${group.name.replaceAll('"', "")}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
});
documents.post("/:id/retry", (c) => {
  const id = c.req.param("id");
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(id) as DocumentRecord | null;
  if (!document)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  if (document.status !== "failed")
    return c.json(
      {
        error: {
          message: "Only failed ingestion jobs can be retried",
          code: "INVALID_STATE",
        },
      },
      409,
    );
  db.query(
    "UPDATE documents SET status='uploaded',error_message=NULL,updated_at=? WHERE id=?",
  ).run(new Date().toISOString(), id);
  setTimeout(() => void ingestDocument(id), 100);
  return c.json({ accepted: true }, 202);
});
documents.post("/:id/reindex", (c) => {
  const id = c.req.param("id");
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(id) as DocumentRecord | null;
  if (!document)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  if (!["ready", "failed"].includes(document.status))
    return c.json(
      {
        error: {
          message: "Document ingestion is already in progress",
          code: "INVALID_STATE",
        },
      },
      409,
    );
  db.query(
    "UPDATE documents SET status='uploaded',error_message=NULL,updated_at=? WHERE id=?",
  ).run(new Date().toISOString(), id);
  setTimeout(() => void ingestDocument(id), 100);
  return c.json({ accepted: true }, 202);
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
documents.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const document = db
    .query("SELECT * FROM documents WHERE id=?")
    .get(id) as DocumentRecord | null;
  if (!document)
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  const deletedNoteIds = (
    db
      .query("SELECT id FROM note_pages WHERE document_id=?")
      .all(id) as Array<{ id: string }>
  ).map((note) => note.id);
  const deletedGraphNodeIds = getKnowledgeGraph(id).nodes.map(
    (node) => node.id,
  );
  await deleteFileIfExists(document.file_path);
  db.transaction(() => {
    db.query(
      `DELETE FROM explanation_history
       WHERE document_id=?
          OR note_id IN (SELECT id FROM note_pages WHERE document_id=?)`,
    ).run(id, id);
    db.query("DELETE FROM documents WHERE id=?").run(id);
  })();
  removeManualGraphNodes(deletedGraphNodeIds, id);
  return c.json({ deletedNoteIds });
});
export default documents;
