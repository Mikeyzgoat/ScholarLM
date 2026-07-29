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
CREATE TABLE IF NOT EXISTS standalone_canvases (id TEXT PRIMARY KEY,title TEXT NOT NULL,snapshot TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sticky_note_index (id TEXT PRIMARY KEY,note_id TEXT NOT NULL,document_id TEXT NOT NULL,shape_id TEXT NOT NULL,label TEXT NOT NULL,content TEXT NOT NULL,kind TEXT NOT NULL,content_hash TEXT NOT NULL,embedding TEXT NOT NULL,updated_at TEXT NOT NULL,explanation_id TEXT,page_number INTEGER,FOREIGN KEY (note_id) REFERENCES note_pages(id) ON DELETE CASCADE,FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_sticky_note_index_document ON sticky_note_index(document_id);
CREATE TABLE IF NOT EXISTS speech_cache (text_hash TEXT PRIMARY KEY,source_text TEXT,text TEXT NOT NULL,audio BLOB NOT NULL,byte_size INTEGER NOT NULL,hit_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,last_accessed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS generated_output_audio (source_hash TEXT NOT NULL,text_hash TEXT NOT NULL,source_text TEXT NOT NULL,output_text TEXT NOT NULL,created_at TEXT NOT NULL,last_accessed_at TEXT NOT NULL,PRIMARY KEY(source_hash,text_hash),FOREIGN KEY (text_hash) REFERENCES speech_cache(text_hash) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS explanation_history (id TEXT PRIMARY KEY,selection_hash TEXT NOT NULL,selected_text TEXT NOT NULL,document_id TEXT,note_id TEXT,document_title TEXT,page_number INTEGER,prompt_mode TEXT NOT NULL,explanation TEXT NOT NULL,created_at TEXT NOT NULL,recognized_text TEXT,input_kind TEXT NOT NULL DEFAULT 'text',canvas_id TEXT,shape_id TEXT);
CREATE INDEX IF NOT EXISTS idx_explanation_history_selection_created ON explanation_history(selection_hash,created_at DESC);
CREATE TABLE IF NOT EXISTS openrouter_requests (id TEXT PRIMARY KEY,operation TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,http_status INTEGER,error_code TEXT,error_message TEXT,created_at TEXT NOT NULL,completed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_openrouter_requests_created ON openrouter_requests(created_at DESC);
CREATE TABLE IF NOT EXISTS explanation_audio (explanation_id TEXT PRIMARY KEY,text_hash TEXT NOT NULL,created_at TEXT NOT NULL,last_accessed_at TEXT NOT NULL,FOREIGN KEY (explanation_id) REFERENCES explanation_history(id) ON DELETE CASCADE,FOREIGN KEY (text_hash) REFERENCES speech_cache(text_hash) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS runtime_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);
  const columns = db.query("PRAGMA table_info(documents)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === "content_hash"))
    db.exec("ALTER TABLE documents ADD COLUMN content_hash TEXT;");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash) WHERE content_hash IS NOT NULL;",
  );
  const speechColumns = db.query("PRAGMA table_info(speech_cache)").all() as Array<{
    name: string;
  }>;
  if (!speechColumns.some((column) => column.name === "source_text"))
    db.exec("ALTER TABLE speech_cache ADD COLUMN source_text TEXT;");
  const stickyColumns = db
    .query("PRAGMA table_info(sticky_note_index)")
    .all() as Array<{ name: string }>;
  if (!stickyColumns.some((column) => column.name === "explanation_id"))
    db.exec("ALTER TABLE sticky_note_index ADD COLUMN explanation_id TEXT;");
  if (!stickyColumns.some((column) => column.name === "page_number"))
    db.exec("ALTER TABLE sticky_note_index ADD COLUMN page_number INTEGER;");
  const explanationColumns = db
    .query("PRAGMA table_info(explanation_history)")
    .all() as Array<{ name: string }>;
  if (!explanationColumns.some((column) => column.name === "document_id"))
    db.exec("ALTER TABLE explanation_history ADD COLUMN document_id TEXT;");
  if (!explanationColumns.some((column) => column.name === "note_id"))
    db.exec("ALTER TABLE explanation_history ADD COLUMN note_id TEXT;");
  if (!explanationColumns.some((column) => column.name === "recognized_text"))
    db.exec("ALTER TABLE explanation_history ADD COLUMN recognized_text TEXT;");
  if (!explanationColumns.some((column) => column.name === "input_kind"))
    db.exec(
      "ALTER TABLE explanation_history ADD COLUMN input_kind TEXT NOT NULL DEFAULT 'text';",
    );
  if (!explanationColumns.some((column) => column.name === "canvas_id"))
    db.exec("ALTER TABLE explanation_history ADD COLUMN canvas_id TEXT;");
  if (!explanationColumns.some((column) => column.name === "shape_id"))
    db.exec("ALTER TABLE explanation_history ADD COLUMN shape_id TEXT;");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_explanation_history_document_created ON explanation_history(document_id,created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_sticky_note_index_explanation ON sticky_note_index(explanation_id) WHERE explanation_id IS NOT NULL;",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_explanation_history_canvas_created ON explanation_history(canvas_id,created_at DESC);",
  );
  db.exec(
    `UPDATE explanation_history
     SET input_kind='handwriting'
     WHERE selected_text IN ('Handwritten equation','Handwritten canvas selection')`,
  );
  db.exec(
    `UPDATE explanation_history
     SET document_id=(
       SELECT documents.id FROM documents
       WHERE documents.name=explanation_history.document_title
       LIMIT 1
     )
     WHERE document_id IS NULL AND document_title IS NOT NULL`,
  );
}
