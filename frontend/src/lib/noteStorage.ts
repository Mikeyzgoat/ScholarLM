import {NOTE_STORAGE_PREFIX} from "./constants";import type {NotePage} from "./types";
export interface LocalNoteDraft{noteId:string;snapshot:unknown;metadata:unknown;revision:number;updatedAt:string}
export function getNoteStorageKey(noteId:string):string{return `${NOTE_STORAGE_PREFIX}:${noteId}`}
export function saveLocalNoteDraft(draft:LocalNoteDraft):void{localStorage.setItem(getNoteStorageKey(draft.noteId),JSON.stringify(draft))}
export function getLocalNoteDraft(noteId:string):LocalNoteDraft|null{try{const raw=localStorage.getItem(getNoteStorageKey(noteId));if(!raw)return null;const value:unknown=JSON.parse(raw);if(!value||typeof value!=="object")return null;const d=value as Partial<LocalNoteDraft>;return d.noteId===noteId&&typeof d.revision==="number"&&typeof d.updatedAt==="string"?d as LocalNoteDraft:null}catch{return null}}
export function removeLocalNoteDraft(noteId:string):void{localStorage.removeItem(getNoteStorageKey(noteId))}
export function chooseNewestNoteSource({server,local}:{server:NotePage;local:LocalNoteDraft|null}):"server"|"local"{if(!local)return"server";const localTime=Date.parse(local.updatedAt),serverTime=Date.parse(server.updatedAt);return Number.isFinite(localTime)&&localTime>serverTime?"local":"server"}
