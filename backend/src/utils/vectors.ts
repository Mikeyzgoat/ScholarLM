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
export function parseEmbedding(value: string | Uint8Array): number[] {
  if (value instanceof Uint8Array) {
    if (value.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0)
      throw new Error("Invalid binary embedding");
    const bytes = value.slice();
    return Array.from(new Float32Array(bytes.buffer));
  }
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "number"))
    throw new Error("Invalid embedding");
  return parsed;
}
export function serializeEmbedding(value: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(value).buffer);
}

export function normalizeVector(value: number[]): Float32Array {
  let magnitude = 0;
  for (const component of value) magnitude += component * component;
  const scale = magnitude > 0 ? 1 / Math.sqrt(magnitude) : 0;
  return Float32Array.from(value, (component) => component * scale);
}

export function dotProduct(
  left: Float32Array,
  right: Float32Array,
): number {
  if (left.length !== right.length)
    throw new Error("Vectors must have the same length");
  let score = 0;
  for (let index = 0; index < left.length; index += 1)
    score += left[index] * right[index];
  return score;
}
