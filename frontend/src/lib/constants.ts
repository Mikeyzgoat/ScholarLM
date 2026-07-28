export const API_BASE_URL:string=(globalThis as typeof globalThis&{process?:{env?:Record<string,string>}}).process?.env?.API_BASE_URL??"http://localhost:3001";
export const DOCUMENT_STATUS_POLL_INTERVAL=1500;
export const GRAPH_POLL_INTERVAL=2000;
export const NOTE_AUTOSAVE_DELAY=1000;
export const NOTE_STORAGE_PREFIX="scholarlm-note-draft";
