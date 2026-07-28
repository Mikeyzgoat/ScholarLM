import {apiFetch} from "../lib/api";import type {NotePage} from "../lib/types";
export async function createNote(input:{documentId:string;title:string;metadata:unknown;snapshot:unknown}):Promise<NotePage>{return(await apiFetch<{note:NotePage}>("/notes",{method:"POST",body:JSON.stringify(input)})).note}
export async function listDocumentNotes(documentId:string):Promise<NotePage[]>{return(await apiFetch<{notes:NotePage[]}>(`/notes/document/${documentId}`)).notes}
export async function getNote(noteId:string):Promise<NotePage>{return(await apiFetch<{note:NotePage}>(`/notes/${noteId}`)).note}
export async function updateNote(input:{noteId:string;title?:string;metadata?:unknown;snapshot?:unknown;expectedRevision?:number}):Promise<NotePage>{const{noteId,...body}=input;return(await apiFetch<{note:NotePage}>(`/notes/${noteId}`,{method:"PUT",body:JSON.stringify(body)})).note}
export async function deleteNote(noteId:string):Promise<void>{await apiFetch(`/notes/${noteId}`,{method:"DELETE"})}
