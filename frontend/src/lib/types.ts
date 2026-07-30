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
  pageNumber: number | null;
  content: string;
  score: number;
  kind?: "pdf" | "sticky";
  label?: string;
  noteId?: string;
  shapeId?: string;
  stickyKind?: "explanation" | "note";
  explanationId?: string;
}
export interface RagSource extends Omit<SearchResult, "pageNumber"> {
  sourceId: string;
  pageNumber: number;
  documentId?: string;
  documentName?: string;
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
  kind?:
    | "hub"
    | "source"
    | "concept"
    | "note"
    | "sticky"
    | "handwriting";
  documentId?: string;
  noteId?: string;
  canvasId?: string;
  shapeId?: string;
  shapeIds?: string[];
  stickyKind?: "explanation" | "note";
  explanationId?: string;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  manual?: boolean;
}
export interface GraphGroup {
  id: string;
  name: string;
  color: string;
  memberNodeIds: string[];
  scope: "global" | "document";
  indexStatus: "indexed" | "empty" | "stale";
  indexedCandidateCount: number;
}
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
}
export interface ExplanationResponse {
  explanation: string;
  answers?: string[];
  recognizedEquation?: string;
  plot?: MathPlot;
  historyId?: string;
  revisionCount?: number;
  cached?: boolean;
}
export interface MathPlot {
  title: string;
  xLabel: string;
  yLabel: string;
  points: Array<{ x: number; y: number }>;
  segments?: Array<Array<{ x: number; y: number }>>;
}
export interface CanvasSelection {
  text: string;
  texts?: string[];
  imageDataUrl?: string;
  existingExplanation?: string;
  explanationId?: string;
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
