import {apiFetch} from "../lib/api";import type {ExplanationResponse} from "../lib/types";
export async function explainText(input:{selectedText:string;documentTitle?:string;pageNumber?:number;signal?:AbortSignal}):Promise<string>{const{signal,...body}=input;return(await apiFetch<ExplanationResponse>("/explain",{method:"POST",body:JSON.stringify(body),signal})).explanation}
