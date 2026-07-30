const lowContextWords = new Set([
  "a",
  "an",
  "are",
  "as",
  "be",
  "been",
  "being",
  "can",
  "could",
  "did",
  "do",
  "does",
  "describe",
  "explain",
  "had",
  "has",
  "have",
  "how",
  "is",
  "it",
  "may",
  "might",
  "please",
  "shall",
  "should",
  "the",
  "was",
  "were",
  "will",
  "what",
  "would",
]);

const meaningSensitiveWords = new Set([
  "against",
  "before",
  "except",
  "from",
  "into",
  "never",
  "no",
  "not",
  "only",
  "over",
  "under",
  "until",
  "with",
  "without",
]);

function stripLowContextWords(text: string): string {
  return text.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu, (word) => {
    const normalized = word.toLowerCase();
    if (meaningSensitiveWords.has(normalized)) return word;
    return lowContextWords.has(normalized) ? "" : word;
  });
}

function normalizeEmbeddingText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/^[ \t]*(?:page\s+)?\d+(?:\s*(?:of|\/)\s*\d+)?[ \t]*$/gimu, "")
    .replace(/\.{4,}/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Compact retrieval text; original chunk content remains unchanged. */
export function compactDocumentEmbeddingText(text: string): string {
  const normalized = normalizeEmbeddingText(text);
  const compact = stripLowContextWords(normalized)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
  return compact.length >= 24 ? compact : normalized;
}

export function compactQueryEmbeddingText(text: string): string {
  const normalized = normalizeEmbeddingText(text)
    .replace(
      /^(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?/iu,
      "",
    )
    .replace(
      /^(?:please\s+)?(?:explain|describe|tell\s+me\s+about)\s+(?:in\s+detail\s+)?/iu,
      "",
    );
  const compact = stripLowContextWords(normalized)
    .replace(/\s{2,}/g, " ")
    .trim();
  return compact.length >= 3 ? compact : normalized;
}
