import {apiFetch} from "../lib/api";import {API_BASE_URL} from "../lib/constants";import type {DocumentDetails,DocumentStatusResponse,DocumentSummary} from "../lib/types";
export async function uploadDocument(file:File):Promise<DocumentSummary>{const body=new FormData();body.append("file",file);return (await apiFetch<{document:DocumentSummary}>("/documents",{method:"POST",body})).document}
export async function listDocuments():Promise<DocumentSummary[]>{return (await apiFetch<{documents:DocumentSummary[]}>("/documents")).documents}
export async function getDocument(documentId:string):Promise<DocumentDetails>{return (await apiFetch<{document:DocumentDetails}>(`/documents/${documentId}`)).document}
export async function getDocumentStatus(documentId:string):Promise<DocumentStatusResponse>{return apiFetch(`/documents/${documentId}/status`)}
export function getDocumentFileUrl(documentId:string):string{return `${API_BASE_URL}/documents/${documentId}/file`}
