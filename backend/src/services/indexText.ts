import type { ExtractedPdfPage } from "./pdf";

function normalizeRepeatedLine(line: string): string {
  return line
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b\d+(?:[./-]\d+)*\b/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes likely watermarks and running headers/footers from indexing text.
 * The original extracted pages and rendered PDF are never modified.
 */
export function preparePagesForIndexing(
  pages: ExtractedPdfPage[],
): ExtractedPdfPage[] {
  if (pages.length < 3) return pages;
  const occurrences = new Map<
    string,
    { pages: Set<number>; edgePages: Set<number> }
  >();
  for (const page of pages) {
    const lines = page.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    lines.forEach((line, index) => {
      if (line.length < 4 || line.length > 200) return;
      const normalized = normalizeRepeatedLine(line);
      if (normalized.length < 4) return;
      const entry = occurrences.get(normalized) ?? {
        pages: new Set<number>(),
        edgePages: new Set<number>(),
      };
      entry.pages.add(page.pageNumber);
      if (index < 4 || index >= lines.length - 4)
        entry.edgePages.add(page.pageNumber);
      occurrences.set(normalized, entry);
    });
  }
  const repeated = new Set(
    [...occurrences.entries()]
      .filter(([, value]) => {
        const pageRatio = value.pages.size / pages.length;
        const edgeRatio = value.edgePages.size / pages.length;
        return pageRatio >= 0.55 || edgeRatio >= 0.3;
      })
      .map(([line]) => line),
  );
  if (!repeated.size) return pages;
  return pages.map((page) => ({
    ...page,
    content: page.content
      .split(/\r?\n/)
      .filter((line) => !repeated.has(normalizeRepeatedLine(line)))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  }));
}
