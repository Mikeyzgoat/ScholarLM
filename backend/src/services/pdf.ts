import { PDFParse } from "pdf-parse";
export interface ExtractedPdfPage {
  pageNumber: number;
  content: string;
  tables?: string[][][];
  visualImageDataUrl?: string;
}
export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPdfPage[];
}
export async function extractPdf(
  filePath: string,
  options: { includeVisuals?: boolean } = {},
): Promise<ExtractedPdf> {
  const parser = new PDFParse({
    data: new Uint8Array(await Bun.file(filePath).arrayBuffer()),
  });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const tableResult = await parser.getTable().catch(() => null);
    const imageResult = options.includeVisuals
      ? await parser
          .getImage({
            imageThreshold: 180,
            imageBuffer: false,
            imageDataUrl: false,
          })
          .catch(() => null)
      : null;
    const tablesByPage = new Map(
      (tableResult?.pages ?? []).map((page) => [page.num, page.tables]),
    );
    const imagePages = new Set(
      (imageResult?.pages ?? [])
        .filter((page) => page.images.length > 0)
        .map((page) => page.pageNumber),
    );
    const visualCandidates = options.includeVisuals
      ? result.pages
          .filter(
            (page) =>
              imagePages.has(page.num) || page.text.trim().length < 40,
          )
          .slice(0, 32)
          .map((page) => page.num)
      : [];
    const screenshots = visualCandidates.length
      ? await parser
          .getScreenshot({
            partial: visualCandidates,
            desiredWidth: 1400,
            imageBuffer: false,
            imageDataUrl: true,
          })
          .catch(() => null)
      : null;
    const screenshotByPage = new Map(
      (screenshots?.pages ?? []).map((page) => [
        page.pageNumber,
        page.dataUrl,
      ]),
    );
    return {
      pageCount: result.total,
      pages: result.pages
        .map((p) => ({
          pageNumber: p.num,
          content: p.text.trim(),
          tables: tablesByPage.get(p.num) ?? [],
          visualImageDataUrl: screenshotByPage.get(p.num),
        }))
        .filter(
          (p) =>
            p.content.length > 0 ||
            Boolean(p.visualImageDataUrl) ||
            Boolean(p.tables?.length),
        ),
    };
  } catch (e) {
    throw new Error(
      `Unable to extract PDF text: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    await parser.destroy();
  }
}
