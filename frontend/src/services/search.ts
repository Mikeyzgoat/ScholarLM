import {apiFetch} from "../lib/api";import type {SearchResult} from "../lib/types";
export async function searchDocument(input:{documentId:string;query:string;limit?:number}):Promise<SearchResult[]>{return(await apiFetch<{results:SearchResult[]}>("/search",{method:"POST",body:JSON.stringify(input)})).results}
