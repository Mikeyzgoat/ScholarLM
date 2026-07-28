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
export interface RagSource extends SearchResult {
  sourceId: string;
}
export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  grounded: boolean;
}
export interface GraphNode {
  id: string;
  label: string;
  description: string | null;
  pageNumber: number | null;
  kind?: "hub" | "source" | "concept" | "note";
  documentId?: string;
  noteId?: string;
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
  answers?: string[];
  recognizedEquation?: string;
  plot?: MathPlot;
  historyId?: string;
  revisionCount?: number;
}
export interface MathPlot {
  title: string;
  xLabel: string;
  yLabel: string;
  points: Array<{ x: number; y: number }>;
}
export interface CanvasSelection {
  text: string;
  texts?: string[];
  imageDataUrl?: string;
  existingExplanation?: string;
  generatedOutput?: boolean;
  anchors?: CanvasSelectionAnchor[];
}
export interface CanvasSelectionAnchor {
  shapeId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
