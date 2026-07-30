import type { ExtractedPdfPage } from "./pdf";
import {
  describeDocumentPageCollage,
  describeDocumentPageVisual,
} from "./openRouter";
import sharp from "sharp";

function dataUrlBuffer(dataUrl: string): Buffer {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Buffer.from(encoded, "base64");
}

function needsFullResolution(page: ExtractedPdfPage): boolean {
  const tableCells = (page.tables ?? []).reduce(
    (total, table) =>
      total + table.reduce((cells, row) => cells + row.length, 0),
    0,
  );
  const tokens = page.content.match(/[\p{L}\p{N}$€£¥.,()%+-]+/gu) ?? [];
  const numeric = tokens.filter((token) => /\d/u.test(token)).length;
  return (
    tableCells >= 8 ||
    (tokens.length > 20 && numeric / tokens.length >= 0.18) ||
    /\b(?:balance sheet|cash flow|financial statement|income statement)\b/iu.test(
      page.content,
    )
  );
}

async function labeledPanel(page: ExtractedPdfPage): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  const labelHeight = 54;
  const label = Buffer.from(
    `<svg width="1100" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="1100" height="${labelHeight}" fill="#111827"/>
      <text x="22" y="36" fill="#ffffff" font-family="sans-serif" font-size="25" font-weight="700">PAGE ${page.pageNumber}</text>
    </svg>`,
  );
  const { data, info } = await sharp(dataUrlBuffer(page.visualImageDataUrl!))
    .flatten({ background: "#ffffff" })
    .resize({ width: 1100 })
    .extend({ top: labelHeight, background: "#ffffff" })
    .composite([{ input: label, top: 0, left: 0 }])
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function makeCollage(pages: ExtractedPdfPage[]): Promise<string> {
  const panels = await Promise.all(pages.map(labeledPanel));
  const width = Math.max(...panels.map((panel) => panel.width));
  const height = panels.reduce((total, panel) => total + panel.height, 0);
  let top = 0;
  const composite = panels.map((panel) => {
    const item = { input: panel.data, top, left: 0 };
    top += panel.height;
    return item;
  });
  const data = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(composite)
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

export async function addVisualContext(
  pages: ExtractedPdfPage[],
  documentTitle: string,
): Promise<ExtractedPdfPage[]> {
  const enriched = [...pages];
  const visualPages = enriched.filter((page) => page.visualImageDataUrl);
  const fullResolution = visualPages.filter(needsFullResolution);
  const collageCandidates = visualPages.filter(
    (page) => !needsFullResolution(page),
  );
  const jobs: Array<() => Promise<void>> = fullResolution.map((page) => {
    return async () => {
      try {
        const description = await describeDocumentPageVisual({
          imageDataUrl: page.visualImageDataUrl!,
          documentTitle,
          pageNumber: page.pageNumber,
          extractedText: page.content,
        });
        const index = enriched.findIndex(
          (item) => item.pageNumber === page.pageNumber,
        );
        if (description.trim() && index >= 0)
          enriched[index] = {
            ...page,
            content:
              `${page.content}\n\nVisual context:\n${description.trim()}`.trim(),
            visualImageDataUrl: undefined,
          };
      } catch (error) {
        console.warn(
          `[visual-ingestion] Page ${page.pageNumber} skipped`,
          error,
        );
      }
    };
  });
  for (let index = 0; index < collageCandidates.length; index += 2) {
    const batch = collageCandidates.slice(index, index + 2);
    jobs.push(async () => {
      try {
        const descriptions = await describeDocumentPageCollage({
          imageDataUrl: await makeCollage(batch),
          documentTitle,
          pages: batch.map((page) => ({
            pageNumber: page.pageNumber,
            extractedText: page.content,
          })),
        });
        batch.forEach((page) => {
          const description = descriptions.get(page.pageNumber);
          const pageIndex = enriched.findIndex(
            (item) => item.pageNumber === page.pageNumber,
          );
          if (pageIndex < 0) return;
          enriched[pageIndex] = {
            ...page,
            content: description
              ? `${page.content}\n\nVisual context:\n${description}`.trim()
              : page.content,
            visualImageDataUrl: undefined,
          };
        });
      } catch (error) {
        console.warn(
          `[visual-ingestion] Collage pages ${batch.map((page) => page.pageNumber).join(", ")} skipped`,
          error,
        );
      }
    });
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) await jobs[cursor++]();
  };
  await Promise.all([worker(), worker()]);
  return enriched.map((page) => ({ ...page, visualImageDataUrl: undefined }));
}
