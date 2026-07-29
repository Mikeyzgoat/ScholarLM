import { apiFetch } from "../lib/api";
import { API_BASE_URL } from "../lib/constants";
import type {
  DocumentDetails,
  DocumentStatusResponse,
  DocumentSummary,
} from "../lib/types";
import { removeLocalNoteDraft } from "../lib/noteStorage";
export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const body = new FormData();
  body.append("file", file);
  return (
    await apiFetch<{ document: DocumentSummary }>("/documents", {
      method: "POST",
      body,
    })
  ).document;
}
export async function listDocuments(): Promise<DocumentSummary[]> {
  return (await apiFetch<{ documents: DocumentSummary[] }>("/documents"))
    .documents;
}
export async function getDocument(
  documentId: string,
): Promise<DocumentDetails> {
  return (
    await apiFetch<{ document: DocumentDetails }>(`/documents/${documentId}`)
  ).document;
}
export async function getDocumentStatus(
  documentId: string,
): Promise<DocumentStatusResponse> {
  return apiFetch(`/documents/${documentId}/status`);
}
export async function retryDocumentIngestion(documentId: string): Promise<void> {
  await apiFetch(`/documents/${documentId}/retry`, { method: "POST" });
}
export async function reindexDocument(documentId: string): Promise<void> {
  await apiFetch(`/documents/${documentId}/reindex`, { method: "POST" });
}
export async function deleteDocument(documentId: string): Promise<void> {
  const result = await apiFetch<{ deletedNoteIds: string[] }>(
    `/documents/${documentId}`,
    { method: "DELETE" },
  );
  result.deletedNoteIds.forEach(removeLocalNoteDraft);
}
export function getDocumentFileUrl(documentId: string): string {
  return `${API_BASE_URL}/documents/${documentId}/file`;
}
