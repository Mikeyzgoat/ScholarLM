export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "graphing"
  | "ready"
  | "failed";
export interface DocumentSummary {
  id: string;
  name: string;
  originalName: string;
  status: DocumentStatus;
  pageCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
export type DocumentDetails = DocumentSummary;
export interface DocumentStatusResponse {
  id: string;
  status: DocumentStatus;
  errorMessage: string | null;
  pageCount: number | null;
  updatedAt: string;
}
export interface SearchResult {
  chunkId: string;
  pageNumber: number;
  content: string;
  score: number;
}
export interface GraphNode {
  id: string;
  label: string;
  description: string | null;
  pageNumber: number | null;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface ExplanationResponse {
  explanation: string;
}
export interface NotePage {
  id: string;
  documentId: string;
  title: string;
  metadata: unknown;
  snapshot: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export type SaveState = "saved" | "saving" | "unsaved" | "error";
