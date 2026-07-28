export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "graphing"
  | "ready"
  | "failed";
export interface DocumentRecord {
  id: string;
  name: string;
  original_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string | null;
  page_count: number | null;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
export interface DocumentPageRecord {
  id: string;
  document_id: string;
  page_number: number;
  content: string;
  created_at: string;
}
export interface ChunkRecord {
  id: string;
  document_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  embedding: string | Uint8Array | null;
  created_at: string;
}
export interface ConceptRecord {
  id: string;
  document_id: string;
  label: string;
  description: string | null;
  page_number: number | null;
  created_at: string;
}
export interface ConceptEdgeRecord {
  id: string;
  document_id: string;
  source_concept_id: string;
  target_concept_id: string;
  relationship: string;
  created_at: string;
}
export interface NotePageRecord {
  id: string;
  documentId: string;
  title: string;
  metadata: unknown;
  snapshot: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface SearchRequest {
  documentId: string;
  query: string;
  limit?: number;
}
export interface SearchResult {
  chunkId: string;
  pageNumber: number;
  content: string;
  score: number;
}
export interface RagSource extends SearchResult {
  sourceId: string;
}
export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  grounded: boolean;
}
export interface ExplainRequest {
  selectedText?: string;
  imageDataUrl?: string;
  documentTitle?: string;
  pageNumber?: number;
}
export interface ExplainResponse {
  explanation: string;
  recognizedEquation?: string;
  plot?: {
    title: string;
    xLabel: string;
    yLabel: string;
    points: Array<{ x: number; y: number }>;
  };
}
export interface GraphResponse {
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
}
export interface CreateNoteRequest {
  documentId: string;
  title: string;
  metadata: unknown;
  snapshot: unknown;
}
export interface UpdateNoteRequest {
  title?: string;
  metadata?: unknown;
  snapshot?: unknown;
  expectedRevision?: number;
}
