export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new Error("Vectors must have the same length");
  let dot = 0,
    ma = 0,
    mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  return ma === 0 || mb === 0 ? 0 : dot / (Math.sqrt(ma) * Math.sqrt(mb));
}
export function parseEmbedding(value: string): number[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "number"))
    throw new Error("Invalid embedding");
  return parsed;
}
export function serializeEmbedding(value: number[]): string {
  return JSON.stringify(value);
}
