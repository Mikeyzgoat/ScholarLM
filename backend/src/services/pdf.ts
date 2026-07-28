import { PDFParse } from "pdf-parse";
export interface ExtractedPdfPage {
  pageNumber: number;
  content: string;
}
export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPdfPage[];
}
export async function extractPdf(filePath: string): Promise<ExtractedPdf> {
  const parser = new PDFParse({
    data: new Uint8Array(await Bun.file(filePath).arrayBuffer()),
  });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return {
      pageCount: result.total,
      pages: result.pages
        .map((p) => ({ pageNumber: p.num, content: p.text.trim() }))
        .filter((p) => p.content.length > 0),
    };
  } catch (e) {
    throw new Error(
      `Unable to extract PDF text: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    await parser.destroy();
  }
}
