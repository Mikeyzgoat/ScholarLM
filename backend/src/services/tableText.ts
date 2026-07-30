import type { ExtractedPdfPage } from "./pdf";

function cleanCell(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function usefulTable(rows: string[][]): boolean {
  if (rows.length < 2 || Math.max(...rows.map((row) => row.length), 0) < 2)
    return false;
  const cells = rows.flat();
  return (
    cells.length >= 4 &&
    cells.filter((cell) => cleanCell(cell).length > 0).length / cells.length >=
      0.4
  );
}

function tableToText(rows: string[][], tableNumber: number): string {
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => cleanCell(row[index] ?? "")),
  );
  const header = normalized[0].map(
    (cell, index) => cell || `Column ${index + 1}`,
  );
  const body = normalized.slice(1).map((row, rowIndex) => {
    const values = row
      .map((cell, columnIndex) =>
        cell ? `${header[columnIndex]}: ${cell}` : "",
      )
      .filter(Boolean);
    return `Row ${rowIndex + 1}: ${values.join(" | ")}`;
  });
  return [
    `[Table ${tableNumber}]`,
    `Columns: ${header.join(" | ")}`,
    ...body,
  ].join("\n");
}

/**
 * Adds a retrieval-friendly representation without modifying the stored page
 * text or the rendered PDF.
 */
export function addTableContext(
  pages: ExtractedPdfPage[],
): ExtractedPdfPage[] {
  return pages.map((page) => {
    const tables = (page.tables ?? []).filter(usefulTable);
    if (!tables.length) return page;
    const structured = tables
      .map((table, index) => tableToText(table, index + 1))
      .join("\n\n");
    return {
      ...page,
      content: `${page.content}\n\nStructured tables:\n${structured}`.trim(),
    };
  });
}
