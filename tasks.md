# ScholarLM MVP — Codex Build Tasks

## 0. Non-Negotiable Product Definition

Build **ScholarLM**, an AI-powered semantic learning workspace and virtual teacher.

The MVP must include exactly these capabilities:

1. Upload a PDF.
2. Save the uploaded PDF locally on the backend.
3. Extract text from the PDF.
4. Store page-aware text.
5. Split extracted text into page-aware chunks.
6. Generate embeddings for chunks.
7. Perform semantic search over the uploaded document.
8. Return relevant chunks with page numbers.
9. Navigate the PDF viewer to the selected search result page.
10. Allow the user to select text inside the PDF viewer.
11. Send only the selected text to Gemini for explanation.
12. Display the explanation in an explanation panel.
13. Automatically generate speech for every new explanation using Kokoro.
14. Provide pause, resume, replay, stop, and auto-read controls.
15. Generate and display a document knowledge graph.
16. Clicking a graph node must navigate to the associated PDF page.
17. Provide full-screen tldraw notes.
18. Store each note as one complete tldraw snapshot.
19. Autosave note edits to localStorage immediately.
20. Debounce server autosave by one second.
21. Persist note snapshots in SQLite.
22. On reload, compare local and server snapshots and load the newest one.

Do not build any of the following:

- Chatbot
- Chat history
- Generalized RAG chat
- NotebookLM clone behavior
- Authentication
- Users
- Teams
- Flashcards
- Quizzes
- OCR
- Vector database
- WebSockets
- Cloud file storage
- Normalized tldraw shapes
- Background job queue
- Microservices

Use the exact stack below. Do not substitute technologies.

---

## 1. Required Technology Stack

### Frontend

- Bun
- React 19
- TypeScript
- React Router
- TanStack Query
- Tailwind CSS 4
- bun-plugin-tailwind
- React PDF
- pdfjs-dist
- Sigma.js
- Graphology
- graphology-layout-forceatlas2
- tldraw
- Framer Motion
- Lucide React

### Backend

- Bun
- TypeScript
- Hono
- bun:sqlite
- @google/genai
- pdf-parse
- kokoro-js

### Storage

- SQLite database at `backend/data/scholarlm.sqlite`
- Uploaded PDFs at `backend/data/uploads/`
- Local note recovery drafts in browser localStorage

---

## 2. Repository Structure

Create this exact structure.

```text
scholarlm/
  frontend/
    public/
    src/
      components/
        layout/
          AppLayout.tsx
          Sidebar.tsx
          Topbar.tsx
        documents/
          UploadBox.tsx
          DocumentCard.tsx
          IngestionStatus.tsx
        search/
          SearchBar.tsx
          SearchResults.tsx
        pdf/
          PDFViewer.tsx
          PDFToolbar.tsx
          SelectionPopover.tsx
        graph/
          KnowledgeGraph.tsx
          GraphControls.tsx
        explanation/
          ExplainPanel.tsx
          ExplanationContent.tsx
          AudioControls.tsx
        notes/
          NotesCanvas.tsx
          NotesHeader.tsx
          NotesList.tsx
          SaveStatus.tsx
      pages/
        HomePage.tsx
        WorkspacePage.tsx
        NotesPage.tsx
      hooks/
        useDocumentStatus.ts
        useSemanticSearch.ts
        useKnowledgeGraph.ts
        useExplanation.ts
        useSpeech.ts
        useNoteAutosave.ts
      services/
        documents.ts
        search.ts
        graph.ts
        explanation.ts
        speech.ts
        notes.ts
      lib/
        api.ts
        noteStorage.ts
        constants.ts
        types.ts
        utils.ts
      App.tsx
      main.tsx
      index.css
    index.html
    bunfig.toml
    package.json
    tsconfig.json

  backend/
    src/
      routes/
        documents.ts
        search.ts
        explanation.ts
        graph.ts
        speech.ts
        notes.ts
      services/
        ingestion.ts
        pdf.ts
        chunking.ts
        embeddings.ts
        semanticSearch.ts
        gemini.ts
        knowledgeGraph.ts
        speech.ts
        notes.ts
      db/
        database.ts
        schema.ts
      utils/
        files.ts
        ids.ts
        vectors.ts
      env.ts
      types.ts
      index.ts
    data/
      uploads/
      scholarlm.sqlite
    package.json
    tsconfig.json

  .env.example
  .gitignore
  README.md
```

---

## 3. Backend Package Requirements

Create `backend/package.json` with these dependencies.

```json
{
  "name": "scholarlm-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "NODE_ENV=production bun src/index.ts",
    "typecheck": "bunx tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "latest",
    "hono": "latest",
    "kokoro-js": "latest",
    "pdf-parse": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "latest"
  }
}
```

Do not add Express, Axios, Multer, dotenv, sqlite3, better-sqlite3, UUID libraries, or Nodemon.

Use:

```ts
import { Database } from "bun:sqlite";
```

Use:

```ts
crypto.randomUUID();
```

Use native `fetch`.

---

## 4. Frontend Package Requirements

Create `frontend/package.json` with Bun scripts and the required frontend dependencies.

Required dependencies:

- react
- react-dom
- react-router-dom
- @tanstack/react-query
- react-pdf
- pdfjs-dist
- graphology
- sigma
- graphology-layout-forceatlas2
- tldraw
- framer-motion
- lucide-react

Required dev dependencies:

- typescript
- @types/react
- @types/react-dom
- bun-plugin-tailwind
- tailwindcss

Do not use Vite.

Create `frontend/bunfig.toml`:

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

---

## 5. Environment Variables

Create `.env.example`:

```env
GEMINI_API_KEY=
BACKEND_PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
```

Create backend environment parsing in `backend/src/env.ts`.

Required exported object:

```ts
export const env: {
  GEMINI_API_KEY: string;
  BACKEND_PORT: number;
  FRONTEND_ORIGIN: string;
};
```

Required behavior:

- Throw at startup when `GEMINI_API_KEY` is missing.
- Default `BACKEND_PORT` to `3001`.
- Default `FRONTEND_ORIGIN` to `http://localhost:3000`.

---

## 6. Database Schema

Create schema initialization in `backend/src/db/schema.ts`.

Create exactly these tables.

### `documents`

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  page_count INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Allowed `status` values:

- uploaded
- extracting
- chunking
- embedding
- graphing
- ready
- failed

### `document_pages`

```sql
CREATE TABLE IF NOT EXISTS document_pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

Create unique index on `(document_id, page_number)`.

### `chunks`

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

Create index on `document_id`.

### `concepts`

```sql
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  page_number INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

### `concept_edges`

```sql
CREATE TABLE IF NOT EXISTS concept_edges (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  source_concept_id TEXT NOT NULL,
  target_concept_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (source_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);
```

### `note_pages`

```sql
CREATE TABLE IF NOT EXISTS note_pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  title TEXT NOT NULL,
  metadata TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

Do not create any other tables.

---

## 7. Backend Shared Types

Create `backend/src/types.ts`.

Define and export:

```ts
export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "graphing"
  | "ready"
  | "failed";
```

Define and export interfaces for:

```ts
DocumentRecord;
DocumentPageRecord;
ChunkRecord;
ConceptRecord;
ConceptEdgeRecord;
NotePageRecord;
SearchRequest;
SearchResult;
ExplainRequest;
ExplainResponse;
GraphResponse;
CreateNoteRequest;
UpdateNoteRequest;
```

Use explicit property types. Do not use `any`.

---

## 8. Backend Utility Functions

### `backend/src/utils/ids.ts`

Export:

```ts
export function createId(): string;
```

Implementation must return `crypto.randomUUID()`.

### `backend/src/utils/files.ts`

Export:

```ts
export async function ensureUploadDirectory(): Promise<void>;
export function getUploadPath(documentId: string): string;
export async function saveUploadedPdf(
  file: File,
  documentId: string,
): Promise<string>;
export async function deleteFileIfExists(filePath: string): Promise<void>;
```

Requirements:

- Upload directory is `backend/data/uploads`.
- Saved filename is `${documentId}.pdf`.
- Use `Bun.write`.

### `backend/src/utils/vectors.ts`

Export:

```ts
export function cosineSimilarity(a: number[], b: number[]): number;
export function parseEmbedding(value: string): number[];
export function serializeEmbedding(value: number[]): string;
```

Requirements:

- Throw when vectors have different lengths.
- Return `0` when either vector has zero magnitude.
- Store embeddings as JSON strings.

---

## 9. Database Connection Functions

### `backend/src/db/database.ts`

Export:

```ts
export const db: Database;
export function initializeDatabase(): void;
```

Requirements:

- Ensure `backend/data` exists before opening database.
- Enable foreign keys.
- Call schema initialization once.

---

## 10. Gemini Service

### `backend/src/services/gemini.ts`

Create one Gemini client only.

Export:

```ts
export function getGeminiClient(): GoogleGenAI;
export async function generateEmbedding(text: string): Promise<number[]>;
export async function explainSelectedText(input: {
  selectedText: string;
  documentTitle?: string;
  pageNumber?: number;
}): Promise<string>;
export async function extractConceptGraph(input: {
  documentTitle: string;
  chunks: Array<{
    content: string;
    pageNumber: number;
  }>;
}): Promise<{
  concepts: Array<{
    label: string;
    description: string;
    pageNumber: number | null;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
  }>;
}>;
```

Explanation requirements:

- Explain only the selected text.
- Do not answer unrelated questions.
- Use clear educational language.
- Preserve important technical terminology.
- Use short paragraphs.
- Return plain text.

Knowledge graph requirements:

- Return valid JSON.
- Extract a maximum of 30 concepts.
- Extract only meaningful relationships.
- Every edge source and target must match a returned concept label.
- Use the most relevant page number for each concept.

---

## 11. PDF Extraction Service

### `backend/src/services/pdf.ts`

Export:

```ts
export interface ExtractedPdfPage {
  pageNumber: number;
  content: string;
}

export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPdfPage[];
}

export async function extractPdf(filePath: string): Promise<ExtractedPdf>;
```

Requirements:

- Read PDF from disk.
- Use `pdf-parse`.
- Preserve page numbers.
- Trim page text.
- Exclude pages containing only whitespace.
- Throw a readable error when extraction fails.

If `pdf-parse` does not expose page-separated text directly, use its page-render callback or equivalent supported mechanism to collect page text.

---

## 12. Chunking Service

### `backend/src/services/chunking.ts`

Export:

```ts
export interface TextChunk {
  pageNumber: number;
  chunkIndex: number;
  content: string;
}

export function chunkPages(
  pages: Array<{ pageNumber: number; content: string }>,
  options?: {
    maxCharacters?: number;
    overlapCharacters?: number;
  },
): TextChunk[];
```

Defaults:

- `maxCharacters = 1200`
- `overlapCharacters = 150`

Requirements:

- Keep every chunk linked to one page only.
- Prefer paragraph and sentence boundaries.
- Never return empty chunks.
- Assign `chunkIndex` starting from `0` for each document, not each page.

---

## 13. Embeddings Service

### `backend/src/services/embeddings.ts`

Export:

```ts
export async function embedDocumentChunks(documentId: string): Promise<void>;
```

Required behavior:

1. Load all chunks for the document ordered by `chunk_index`.
2. Skip chunks that already contain an embedding.
3. Call `generateEmbedding` for each remaining chunk.
4. Save the embedding JSON string.
5. Process sequentially or with low concurrency.
6. Do not create unbounded concurrent Gemini requests.

---

## 14. Semantic Search Service

### `backend/src/services/semanticSearch.ts`

Export:

```ts
export async function semanticSearch(input: {
  documentId: string;
  query: string;
  limit?: number;
}): Promise<
  Array<{
    chunkId: string;
    pageNumber: number;
    content: string;
    score: number;
  }>
>;
```

Defaults:

- `limit = 8`

Requirements:

1. Validate query is not empty.
2. Generate query embedding.
3. Load chunks with embeddings for the document.
4. Calculate cosine similarity.
5. Sort descending.
6. Return the highest scoring results.
7. Clamp limit between 1 and 20.

Do not generate a natural-language answer from search.

---

## 15. Knowledge Graph Service

### `backend/src/services/knowledgeGraph.ts`

Export:

```ts
export async function buildKnowledgeGraph(documentId: string): Promise<void>;
export function getKnowledgeGraph(documentId: string): {
  nodes: Array<{
    id: string;
    label: string;
    description: string | null;
    pageNumber: number | null;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relationship: string;
  }>;
};
```

Required behavior:

1. Load document title.
2. Load representative chunks.
3. Limit Gemini input size.
4. Call `extractConceptGraph`.
5. Normalize labels using trimmed lowercase comparison.
6. Deduplicate concepts.
7. Ignore edges referencing missing concepts.
8. Delete existing concepts and edges for the document before inserting rebuilt graph.
9. Insert nodes and edges in one transaction.

---

## 16. Ingestion Service

### `backend/src/services/ingestion.ts`

Export:

```ts
export async function ingestDocument(documentId: string): Promise<void>;
```

Create private helper functions:

```ts
async function updateDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  errorMessage?: string,
): Promise<void>;

async function saveDocumentPages(
  documentId: string,
  pages: ExtractedPdfPage[],
): Promise<void>;

async function saveChunks(
  documentId: string,
  chunks: TextChunk[],
): Promise<void>;
```

Required ingestion order:

1. Set status to `extracting`.
2. Extract PDF.
3. Save pages.
4. Update `page_count`.
5. Set status to `chunking`.
6. Generate chunks.
7. Save chunks.
8. Set status to `embedding`.
9. Generate embeddings.
10. Set status to `graphing`.
11. Generate knowledge graph.
12. Set status to `ready`.
13. On any error, set status to `failed` and save the error message.

The upload request may trigger ingestion without waiting for the full process to finish.

Do not add a job queue.

---

## 17. Speech Service

### `backend/src/services/speech.ts`

Export:

```ts
export async function synthesizeSpeech(text: string): Promise<Uint8Array>;
```

Requirements:

- Use `kokoro-js`.
- Initialize the model lazily once.
- Reuse the initialized model.
- Reject empty text.
- Return playable WAV audio bytes.
- Do not persist generated audio.

---

## 18. Notes Service

### `backend/src/services/notes.ts`

Export:

```ts
export function createNote(input: {
  documentId: string;
  title: string;
  metadata: unknown;
  snapshot: unknown;
}): NotePageRecord;

export function listNotesForDocument(documentId: string): NotePageRecord[];

export function getNote(noteId: string): NotePageRecord | null;

export function updateNote(input: {
  noteId: string;
  title?: string;
  metadata?: unknown;
  snapshot?: unknown;
  expectedRevision?: number;
}): NotePageRecord;

export function deleteNote(noteId: string): boolean;
```

Requirements:

- Store `metadata` and `snapshot` using `JSON.stringify`.
- Parse both when returning records.
- Increment `revision` on every update.
- If `expectedRevision` is provided and does not match, return an HTTP conflict through the route.
- Set `updated_at` on every update.

---

## 19. Backend Routes

Mount all routes under the exact paths below.

### Health

```text
GET /health
```

Response:

```json
{
  "ok": true
}
```

### Documents

```text
POST /documents
GET /documents
GET /documents/:id
GET /documents/:id/status
GET /documents/:id/file
```

#### `POST /documents`

Input:

- multipart form data
- field name: `file`

Validation:

- File is required.
- MIME type must be PDF or filename must end in `.pdf`.
- Maximum size: 50 MB.

Response status: `201`

```json
{
  "document": {
    "id": "string",
    "name": "string",
    "originalName": "string",
    "status": "uploaded",
    "createdAt": "ISO string",
    "updatedAt": "ISO string"
  }
}
```

After the database record is created, trigger `ingestDocument(documentId)` without blocking the response.

#### `GET /documents`

Return all documents ordered by newest first.

#### `GET /documents/:id`

Return one document or `404`.

#### `GET /documents/:id/status`

Response:

```json
{
  "id": "string",
  "status": "uploaded | extracting | chunking | embedding | graphing | ready | failed",
  "errorMessage": "string or null",
  "pageCount": "number or null",
  "updatedAt": "ISO string"
}
```

#### `GET /documents/:id/file`

- Stream the PDF.
- Set `Content-Type: application/pdf`.
- Return `404` when missing.

### Search

```text
POST /search
```

Request:

```json
{
  "documentId": "string",
  "query": "string",
  "limit": 8
}
```

Response:

```json
{
  "results": [
    {
      "chunkId": "string",
      "pageNumber": 1,
      "content": "string",
      "score": 0.87
    }
  ]
}
```

### Explain

```text
POST /explain
```

Request:

```json
{
  "selectedText": "string",
  "documentTitle": "optional string",
  "pageNumber": "optional number"
}
```

Response:

```json
{
  "explanation": "string"
}
```

Validation:

- Minimum selected text length: 3 characters.
- Maximum selected text length: 12000 characters.

### Graph

```text
GET /graph/:documentId
```

Response:

```json
{
  "nodes": [
    {
      "id": "string",
      "label": "string",
      "description": "string or null",
      "pageNumber": "number or null"
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "string",
      "target": "string",
      "relationship": "string"
    }
  ]
}
```

### TTS

```text
POST /tts
```

Request:

```json
{
  "text": "string"
}
```

Response:

- Binary WAV audio.
- `Content-Type: audio/wav`.

Validation:

- Minimum text length: 1.
- Maximum text length: 12000.

### Notes

```text
POST /notes
GET /notes/document/:documentId
GET /notes/:noteId
PUT /notes/:noteId
DELETE /notes/:noteId
```

#### `POST /notes`

Request:

```json
{
  "documentId": "string",
  "title": "string",
  "metadata": {},
  "snapshot": {}
}
```

Return `201` with created note.

#### `GET /notes/document/:documentId`

Return notes ordered by `updated_at DESC`.

#### `GET /notes/:noteId`

Return note or `404`.

#### `PUT /notes/:noteId`

Request:

```json
{
  "title": "optional string",
  "metadata": "optional object",
  "snapshot": "optional object",
  "expectedRevision": "optional number"
}
```

Return updated note.

Return `409` when revision does not match.

#### `DELETE /notes/:noteId`

Return `204` on success.

---

## 20. Backend Application Entry Point

### `backend/src/index.ts`

Required behavior:

1. Initialize the database.
2. Ensure upload directory exists.
3. Create Hono app.
4. Add CORS middleware using `FRONTEND_ORIGIN`.
5. Add JSON error responses.
6. Mount all routes.
7. Add `GET /health`.
8. Start Bun server on `BACKEND_PORT`.

Export app for testing:

```ts
export default app;
```

All errors must use this shape:

```json
{
  "error": {
    "message": "string",
    "code": "string"
  }
}
```

---

## 21. Frontend Shared Types

### `frontend/src/lib/types.ts`

Export explicit types for:

```ts
DocumentStatus;
DocumentSummary;
DocumentDetails;
DocumentStatusResponse;
SearchResult;
GraphNode;
GraphEdge;
GraphResponse;
ExplanationResponse;
NotePage;
SaveState;
```

Required `SaveState`:

```ts
export type SaveState = "saved" | "saving" | "unsaved" | "error";
```

Do not use `any`.

---

## 22. Frontend Constants

### `frontend/src/lib/constants.ts`

Export:

```ts
export const API_BASE_URL: string;
export const DOCUMENT_STATUS_POLL_INTERVAL = 1500;
export const GRAPH_POLL_INTERVAL = 2000;
export const NOTE_AUTOSAVE_DELAY = 1000;
export const NOTE_STORAGE_PREFIX = "scholarlm-note-draft";
```

Use `http://localhost:3001` as default API base URL.

---

## 23. Frontend API Helper

### `frontend/src/lib/api.ts`

Export:

```ts
export class ApiError extends Error {
  status: number;
  code?: string;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T>;
```

Requirements:

- Prefix `API_BASE_URL`.
- Parse JSON responses.
- Throw `ApiError` for non-2xx responses.
- Do not set JSON content type for FormData.
- Support `204` responses.

---

## 24. Frontend Service Functions

### `frontend/src/services/documents.ts`

Export:

```ts
export async function uploadDocument(file: File): Promise<DocumentSummary>;
export async function listDocuments(): Promise<DocumentSummary[]>;
export async function getDocument(documentId: string): Promise<DocumentDetails>;
export async function getDocumentStatus(
  documentId: string,
): Promise<DocumentStatusResponse>;
export function getDocumentFileUrl(documentId: string): string;
```

### `frontend/src/services/search.ts`

Export:

```ts
export async function searchDocument(input: {
  documentId: string;
  query: string;
  limit?: number;
}): Promise<SearchResult[]>;
```

### `frontend/src/services/graph.ts`

Export:

```ts
export async function getDocumentGraph(
  documentId: string,
): Promise<GraphResponse>;
```

### `frontend/src/services/explanation.ts`

Export:

```ts
export async function explainText(input: {
  selectedText: string;
  documentTitle?: string;
  pageNumber?: number;
  signal?: AbortSignal;
}): Promise<string>;
```

### `frontend/src/services/speech.ts`

Export:

```ts
export async function generateSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob>;
```

### `frontend/src/services/notes.ts`

Export:

```ts
export async function createNote(input: {
  documentId: string;
  title: string;
  metadata: unknown;
  snapshot: unknown;
}): Promise<NotePage>;

export async function listDocumentNotes(
  documentId: string,
): Promise<NotePage[]>;
export async function getNote(noteId: string): Promise<NotePage>;

export async function updateNote(input: {
  noteId: string;
  title?: string;
  metadata?: unknown;
  snapshot?: unknown;
  expectedRevision?: number;
}): Promise<NotePage>;

export async function deleteNote(noteId: string): Promise<void>;
```

---

## 25. React Query Setup

### `frontend/src/main.tsx`

Required behavior:

1. Create one `QueryClient`.
2. Wrap app in `QueryClientProvider`.
3. Wrap app in `BrowserRouter`.
4. Render into `#root`.
5. Import `index.css`.

Use reasonable retry behavior:

- Queries retry once.
- Mutations do not retry automatically.

---

## 26. Routes

### `frontend/src/App.tsx`

Create routes:

```text
/                         -> HomePage
/workspace/:documentId    -> WorkspacePage
/notes/:noteId            -> NotesPage
```

Wrap pages in `AppLayout` where appropriate.

Notes page must be full-screen and must not use the standard workspace sidebar layout.

---

## 27. Required Hooks

### `useDocumentStatus.ts`

Export:

```ts
export function useDocumentStatus(documentId: string | undefined): {
  status: DocumentStatusResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};
```

Requirements:

- Use TanStack Query.
- Poll every `DOCUMENT_STATUS_POLL_INTERVAL` while status is not `ready` or `failed`.
- Stop polling when ready or failed.
- Disable query when documentId is missing.

### `useSemanticSearch.ts`

Export:

```ts
export function useSemanticSearch(documentId: string): {
  query: string;
  setQuery: (value: string) => void;
  results: SearchResult[];
  search: () => void;
  isSearching: boolean;
  error: Error | null;
  clear: () => void;
};
```

Requirements:

- Use a mutation.
- Trim query.
- Do not search empty queries.
- Replace old results when a new search succeeds.

### `useKnowledgeGraph.ts`

Export:

```ts
export function useKnowledgeGraph(
  documentId: string | undefined,
  documentStatus: DocumentStatus | undefined,
): {
  graph: GraphResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};
```

Requirements:

- Fetch graph for valid documentId.
- Poll while status is `graphing`.
- Stop polling when status is `ready` or `failed`.

### `useExplanation.ts`

Export:

```ts
export function useExplanation(): {
  explanation: string;
  explain: (input: {
    selectedText: string;
    documentTitle?: string;
    pageNumber?: number;
  }) => Promise<string | null>;
  cancel: () => void;
  clear: () => void;
  isExplaining: boolean;
  error: Error | null;
};
```

Requirements:

- Use `AbortController`.
- Cancel the previous request before starting a new one.
- Ignore stale responses.
- Clear error on new request.

### `useSpeech.ts`

Export:

```ts
export function useSpeech(): {
  speak: (text: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  stop: () => void;
  isLoading: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  autoRead: boolean;
  setAutoRead: (value: boolean) => void;
  error: Error | null;
};
```

Required behavior:

- Store auto-read preference in localStorage.
- Maintain one `HTMLAudioElement`.
- Abort previous TTS generation when new speech starts.
- Revoke previous object URL when replaced.
- `speak` does nothing when auto-read is false unless called explicitly by replay logic.
- `stop` resets playback to time `0`.
- Cleanup audio and object URLs on unmount.

### `useNoteAutosave.ts`

Export:

```ts
export function useNoteAutosave(input: {
  note: NotePage | undefined;
  editor: Editor | null;
  onServerNoteUpdated?: (note: NotePage) => void;
}): {
  saveState: SaveState;
  lastSavedAt: string | null;
  recoverableDraftFound: boolean;
};
```

Required behavior:

1. When editor changes, serialize complete tldraw snapshot.
2. Immediately write local draft.
3. Set state to `unsaved`.
4. Debounce one second.
5. Set state to `saving`.
6. Call `updateNote` with `expectedRevision`.
7. On success, remove local draft.
8. Set state to `saved`.
9. On failure, keep local draft and set state to `error`.
10. Avoid saving when applying the initial snapshot.
11. Cleanup subscriptions and timers.

---

## 28. Local Note Storage Functions

### `frontend/src/lib/noteStorage.ts`

Export:

```ts
export interface LocalNoteDraft {
  noteId: string;
  snapshot: unknown;
  metadata: unknown;
  revision: number;
  updatedAt: string;
}

export function getNoteStorageKey(noteId: string): string;
export function saveLocalNoteDraft(draft: LocalNoteDraft): void;
export function getLocalNoteDraft(noteId: string): LocalNoteDraft | null;
export function removeLocalNoteDraft(noteId: string): void;
export function chooseNewestNoteSource(input: {
  server: NotePage;
  local: LocalNoteDraft | null;
}): "server" | "local";
```

Comparison rule:

- Parse both timestamps.
- Newer `updatedAt` wins.
- Server wins ties.

---

## 29. Layout Components

### `AppLayout.tsx`

Responsibilities:

- Render global shell.
- Render `Sidebar` and `Topbar`.
- Render route content through children or outlet.

### `Sidebar.tsx`

Responsibilities:

- Link to home.
- List recent documents.
- Highlight active document when available.

### `Topbar.tsx`

Responsibilities:

- Display ScholarLM name.
- Display current document title when available.
- Provide no authentication controls.

---

## 30. Document Components

### `UploadBox.tsx`

Required props:

```ts
interface UploadBoxProps {
  onUploaded: (document: DocumentSummary) => void;
}
```

Responsibilities:

- File input accepting PDF only.
- Drag and drop.
- Validate 50 MB maximum.
- Show upload progress state.
- Call `uploadDocument`.
- Report result to parent.

### `DocumentCard.tsx`

Required props:

```ts
interface DocumentCardProps {
  document: DocumentSummary;
  onOpen: (documentId: string) => void;
}
```

Show:

- Name
- Status
- Created date
- Open action

### `IngestionStatus.tsx`

Required props:

```ts
interface IngestionStatusProps {
  status: DocumentStatusResponse;
}
```

Display one human-readable message for every backend status.

---

## 31. Search Components

### `SearchBar.tsx`

Required props:

```ts
interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  disabled?: boolean;
}
```

Requirements:

- Submit on Enter.
- Disable during search or before document is ready.

### `SearchResults.tsx`

Required props:

```ts
interface SearchResultsProps {
  results: SearchResult[];
  onSelectResult: (result: SearchResult) => void;
  isLoading: boolean;
}
```

Show:

- Page number
- Content preview
- Similarity score

Do not show generated answers.

---

## 32. PDF Components

### `PDFViewer.tsx`

Required props:

```ts
interface PDFViewerProps {
  fileUrl: string;
  activePage: number;
  onPageChange: (page: number) => void;
  onTextSelected: (input: { text: string; pageNumber: number }) => void;
}
```

Responsibilities:

- Configure pdf.js worker.
- Load PDF.
- Render one active page.
- Expose page count to toolbar.
- Support zoom.
- Detect selected text.
- Pass selected text and current page to parent.

### `PDFToolbar.tsx`

Required props:

```ts
interface PDFToolbarProps {
  page: number;
  pageCount: number;
  zoom: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}
```

### `SelectionPopover.tsx`

Required props:

```ts
interface SelectionPopoverProps {
  selectedText: string;
  onExplain: () => void;
  onDismiss: () => void;
}
```

The primary action is `Explain selection`.

---

## 33. Explanation Components

### `ExplainPanel.tsx`

Required props:

```ts
interface ExplainPanelProps {
  selectedText: string;
  pageNumber: number | null;
  documentTitle: string;
}
```

Responsibilities:

1. Use `useExplanation`.
2. Use `useSpeech`.
3. When selected text changes and user confirms explain, request explanation.
4. When a new explanation arrives and auto-read is enabled, call `speak(explanation)`.
5. Render loading, error, empty, and success states.
6. Render `AudioControls` only when explanation exists.

### `ExplanationContent.tsx`

Required props:

```ts
interface ExplanationContentProps {
  selectedText: string;
  explanation: string;
  isLoading: boolean;
  error: Error | null;
}
```

### `AudioControls.tsx`

Required props:

```ts
interface AudioControlsProps {
  isLoading: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  autoRead: boolean;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onStop: () => void;
  onAutoReadChange: (value: boolean) => void;
}
```

Do not create a primary `Speak` button.

---

## 34. Graph Components

### `KnowledgeGraph.tsx`

Required props:

```ts
interface KnowledgeGraphProps {
  graph: GraphResponse | undefined;
  isLoading: boolean;
  onNodeSelect: (node: GraphNode) => void;
}
```

Responsibilities:

- Build a Graphology graph.
- Add all nodes and edges.
- Run ForceAtlas2.
- Render with Sigma.js.
- Handle node click.
- Cleanup Sigma instance on unmount.

### `GraphControls.tsx`

Provide:

- Zoom in
- Zoom out
- Reset camera
- Re-run layout

---

## 35. Notes Components

### `NotesCanvas.tsx`

Required props:

```ts
interface NotesCanvasProps {
  note: NotePage;
  onEditorReady: (editor: Editor) => void;
}
```

Responsibilities:

- Render full-screen tldraw.
- Load selected snapshot exactly once.
- Report editor instance.

### `NotesHeader.tsx`

Required props:

```ts
interface NotesHeaderProps {
  title: string;
  saveState: SaveState;
  onTitleChange: (title: string) => void;
  onBack: () => void;
}
```

### `NotesList.tsx`

Required props:

```ts
interface NotesListProps {
  notes: NotePage[];
  onOpen: (noteId: string) => void;
  onCreate: () => void;
}
```

### `SaveStatus.tsx`

Required props:

```ts
interface SaveStatusProps {
  state: SaveState;
  lastSavedAt: string | null;
}
```

Display:

- Saved
- Saving
- Unsaved changes
- Save failed

---

## 36. Pages

### `HomePage.tsx`

Responsibilities:

1. Load document list.
2. Render `UploadBox`.
3. Render `DocumentCard` for every document.
4. On upload success, navigate to `/workspace/:documentId`.
5. On document open, navigate to workspace.

### `WorkspacePage.tsx`

Required local state:

```ts
const [activePage, setActivePage] = useState(1);
const [selectedText, setSelectedText] = useState("");
const [selectedTextPage, setSelectedTextPage] = useState<number | null>(null);
```

Responsibilities:

1. Read `documentId` from route params.
2. Load document details.
3. Poll document status.
4. Use semantic search hook.
5. Use knowledge graph hook.
6. Render search area.
7. Render PDF viewer.
8. Render knowledge graph.
9. Render explanation panel.
10. Selecting a search result sets `activePage`.
11. Selecting a graph node with page number sets `activePage`.
12. Selecting PDF text updates `selectedText` and `selectedTextPage`.
13. Provide action to create or open notes for the document.

Desktop layout:

- Left column: search and results
- Center column: PDF viewer
- Right column: explanation and graph

Responsive behavior may stack panels on smaller screens.

### `NotesPage.tsx`

Responsibilities:

1. Read `noteId` from route params.
2. Load note.
3. Compare server note with local draft.
4. Load the newest snapshot.
5. Mount `NotesCanvas`.
6. Start `useNoteAutosave` after editor is ready.
7. Allow title editing.
8. Display `SaveStatus`.
9. Navigate back to related workspace.

---

## 37. Styling Requirements

Use Tailwind CSS 4.

Design requirements:

- Clean academic workspace.
- Neutral background.
- High-contrast reading area.
- Clear panel boundaries.
- PDF viewer must be the visual center.
- Avoid excessive gradients.
- Avoid glassmorphism.
- Avoid oversized decorative elements.
- Use Lucide icons.
- Use Framer Motion only for subtle panel and loading transitions.
- Maintain keyboard accessibility.
- Add visible focus states.

---

## 38. Error and Loading States

Implement explicit UI states for:

- Document list loading
- Uploading PDF
- Invalid PDF
- Oversized PDF
- Ingestion status
- Ingestion failure
- PDF loading failure
- Search loading
- Search failure
- No search results
- Explanation loading
- Explanation failure
- TTS loading
- TTS failure
- Graph loading
- Empty graph
- Notes loading
- Notes save failure
- Local draft recovery

Do not silently fail.

---

## 39. Validation Rules

Backend validation must enforce:

- PDF maximum size: 50 MB
- Search query: 1 to 1000 characters
- Selected explanation text: 3 to 12000 characters
- TTS text: 1 to 12000 characters
- Note title: 1 to 200 characters
- Document ID and note ID must be non-empty strings

Return `400` for invalid input.

Return `404` for missing resources.

Return `409` for note revision conflicts.

Return `500` only for unexpected server errors.

---

## 40. Build Order

Complete tasks in exactly this order.

### Phase 1 — Foundation

- [ ] Create repository folders.
- [ ] Create frontend and backend package files.
- [ ] Install dependencies.
- [ ] Create TypeScript configs.
- [ ] Create environment handling.
- [ ] Create health route.
- [ ] Verify both applications run.

### Phase 2 — Persistence

- [ ] Create SQLite connection.
- [ ] Create schema.
- [ ] Verify tables exist.
- [ ] Create shared backend types.

### Phase 3 — Document Upload

- [ ] Create file utility functions.
- [ ] Create document routes.
- [ ] Save uploaded PDF.
- [ ] Insert document record.
- [ ] Return document ID.
- [ ] Create frontend upload service.
- [ ] Create upload UI.

### Phase 4 — Ingestion

- [ ] Create PDF extraction service.
- [ ] Store document pages.
- [ ] Create chunking service.
- [ ] Store chunks.
- [ ] Create Gemini client.
- [ ] Create embedding function.
- [ ] Embed chunks.
- [ ] Create knowledge graph extraction.
- [ ] Store graph.
- [ ] Implement ingestion status transitions.

### Phase 5 — Semantic Search

- [ ] Create vector utilities.
- [ ] Create semantic search service.
- [ ] Create search route.
- [ ] Create frontend search service.
- [ ] Create semantic search hook.
- [ ] Create search components.

### Phase 6 — Workspace and PDF

- [ ] Create app routes.
- [ ] Create layout components.
- [ ] Create workspace page.
- [ ] Create PDF file route.
- [ ] Create PDF viewer.
- [ ] Create PDF toolbar.
- [ ] Connect search results to PDF navigation.

### Phase 7 — Explanation

- [ ] Create Gemini explanation function.
- [ ] Create explain route.
- [ ] Create frontend explanation service.
- [ ] Create explanation hook.
- [ ] Create selection popover.
- [ ] Create explanation panel.

### Phase 8 — Speech

- [ ] Create Kokoro speech service.
- [ ] Create TTS route.
- [ ] Create frontend speech service.
- [ ] Create speech hook.
- [ ] Create audio controls.
- [ ] Trigger TTS automatically after explanation.

### Phase 9 — Knowledge Graph UI

- [ ] Create graph route.
- [ ] Create graph frontend service.
- [ ] Create graph hook.
- [ ] Create Graphology graph.
- [ ] Render Sigma graph.
- [ ] Add ForceAtlas2.
- [ ] Connect node click to PDF navigation.

### Phase 10 — Notes

- [ ] Create notes service.
- [ ] Create notes routes.
- [ ] Create frontend notes service.
- [ ] Create notes page.
- [ ] Add tldraw.
- [ ] Store full snapshots.
- [ ] Add notes list.
- [ ] Add note creation.
- [ ] Add note deletion.

### Phase 11 — Autosave

- [ ] Create local note storage helpers.
- [ ] Create note autosave hook.
- [ ] Save local drafts immediately.
- [ ] Debounce server save by one second.
- [ ] Add revision handling.
- [ ] Add newest-snapshot recovery.
- [ ] Add save status UI.

### Phase 12 — Final Integration

- [ ] Verify upload to ready flow.
- [ ] Verify semantic search.
- [ ] Verify page navigation.
- [ ] Verify text selection.
- [ ] Verify Gemini explanation.
- [ ] Verify automatic speech.
- [ ] Verify graph navigation.
- [ ] Verify notes persistence.
- [ ] Verify local recovery.
- [ ] Verify all error states.

---

## 41. Acceptance Criteria

The project is complete only when every item below passes.

### Startup

- [ ] `bun install` succeeds in frontend.
- [ ] `bun install` succeeds in backend.
- [ ] Backend starts without TypeScript errors.
- [ ] Frontend starts without TypeScript errors.
- [ ] `GET /health` returns `{ "ok": true }`.

### Upload and ingestion

- [ ] A PDF can be uploaded from the browser.
- [ ] The PDF is saved in `backend/data/uploads`.
- [ ] A document row is created.
- [ ] Page rows are created.
- [ ] Chunk rows are created.
- [ ] Embeddings are stored.
- [ ] Concepts and edges are stored.
- [ ] Document status becomes `ready`.
- [ ] Failures set status to `failed` with a message.

### Search

- [ ] Search uses embeddings and cosine similarity.
- [ ] Search returns page numbers.
- [ ] Search does not generate a chatbot answer.
- [ ] Clicking a result navigates to that PDF page.

### PDF and explanation

- [ ] PDF renders in the workspace.
- [ ] Page controls work.
- [ ] Zoom controls work.
- [ ] Text can be selected.
- [ ] Selected text can be explained.
- [ ] Explanation is based only on selected text.

### Speech

- [ ] Every new explanation triggers speech automatically when auto-read is enabled.
- [ ] Pause works.
- [ ] Resume works.
- [ ] Replay works.
- [ ] Stop works.
- [ ] New explanation cancels previous speech generation and playback.

### Knowledge graph

- [ ] Graph renders nodes and edges.
- [ ] Layout runs.
- [ ] Node click navigates to page when page number exists.
- [ ] Graph loads without WebSockets.

### Notes

- [ ] Notes open on `/notes/:noteId`.
- [ ] tldraw loads full-screen.
- [ ] Entire snapshot is stored as JSON.
- [ ] Changes write to localStorage immediately.
- [ ] Server save runs after one second of inactivity.
- [ ] Local draft is removed after successful server save.
- [ ] Failed save keeps local draft.
- [ ] Reload chooses newest local or server version.
- [ ] Revision conflict returns `409`.

### Code quality

- [ ] No `any` types unless required by an external library boundary.
- [ ] No fetch calls directly inside visual components.
- [ ] Hooks orchestrate state and side effects.
- [ ] Services perform API calls or backend operations.
- [ ] Utilities contain pure reusable helpers.
- [ ] Private helpers are not exported unnecessarily.
- [ ] No alternative technologies were introduced.
- [ ] No out-of-scope features were added.

---

## 42. Final Delivery Requirements

Codex must deliver:

1. Complete source code in the specified structure.
2. Working frontend and backend package files.
3. `.env.example`.
4. Database schema initialization.
5. All required routes.
6. All required services.
7. All required hooks.
8. All required components.
9. Full README setup instructions.
10. No placeholders.
11. No TODO comments for core functionality.
12. No mocked Gemini, TTS, PDF, graph, or notes behavior.
13. No alternate frameworks.
14. No added features outside this specification.
15. TypeScript code that passes type checking.
