import type { Database } from "bun:sqlite";
export function initializeSchema(db: Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY,name TEXT NOT NULL,original_name TEXT NOT NULL,file_path TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,content_hash TEXT,page_count INTEGER,status TEXT NOT NULL,error_message TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_pages (id TEXT PRIMARY KEY,document_id TEXT NOT NULL,page_number INTEGER NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_pages_document_page ON document_pages(document_id,page_number);
CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY,document_id TEXT NOT NULL,page_number INTEGER NOT NULL,chunk_index INTEGER NOT NULL,content TEXT NOT NULL,embedding TEXT,created_at TEXT NOT NULL,FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY,document_id TEXT NOT NULL,label TEXT NOT NULL,description TEXT,page_number INTEGER,created_at TEXT NOT NULL,FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS concept_edges (id TEXT PRIMARY KEY,document_id TEXT NOT NULL,source_concept_id TEXT NOT NULL,target_concept_id TEXT NOT NULL,relationship TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,FOREIGN KEY (source_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,FOREIGN KEY (target_concept_id) REFERENCES concepts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS note_pages (id TEXT PRIMARY KEY,document_id TEXT NOT NULL,title TEXT NOT NULL,metadata TEXT NOT NULL,snapshot TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE);
`);
  const columns = db.query("PRAGMA table_info(documents)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === "content_hash"))
    db.exec("ALTER TABLE documents ADD COLUMN content_hash TEXT;");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash) WHERE content_hash IS NOT NULL;",
  );
}
