export interface TextChunk { pageNumber:number; chunkIndex:number; content:string }
export function chunkPages(pages:Array<{pageNumber:number;content:string}>,options:{maxCharacters?:number;overlapCharacters?:number}={}):TextChunk[]{
 const max=options.maxCharacters??1200, overlap=options.overlapCharacters??150;
 if(max<1||overlap<0||overlap>=max) throw new Error("Invalid chunk options");
 const out:TextChunk[]=[]; let index=0;
 for(const page of pages){let remaining=page.content.trim(); while(remaining){let end=Math.min(max,remaining.length); if(end<remaining.length){const window=remaining.slice(0,end); const paragraph=window.lastIndexOf("\n\n"); const sentence=Math.max(window.lastIndexOf(". "),window.lastIndexOf("? "),window.lastIndexOf("! ")); const space=window.lastIndexOf(" "); const boundary=paragraph>max*.45?paragraph+2:sentence>max*.45?sentence+2:space>max*.65?space+1:end; end=boundary;} const content=remaining.slice(0,end).trim(); if(content)out.push({pageNumber:page.pageNumber,chunkIndex:index++,content}); if(end>=remaining.length)break; remaining=remaining.slice(Math.max(1,end-overlap)).trimStart();}}
 return out;
}
