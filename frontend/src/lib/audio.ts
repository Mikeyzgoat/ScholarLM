function parseWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (offset: number) =>
    String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
  if (bytes.length < 44 || label(0) !== "RIFF" || label(8) !== "WAVE")
    throw new Error("Kokoro returned an invalid WAV chunk");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    if (label(offset) === "data")
      return {
        bytes,
        dataOffset: offset + 8,
        dataSize: Math.min(size, bytes.length - offset - 8),
        sizeFieldOffset: offset + 4,
      };
    offset += 8 + size + (size % 2);
  }
  throw new Error("Kokoro WAV data is missing");
}

export async function combineWavChunks(chunks: Blob[]): Promise<Blob> {
  if (!chunks.length) throw new Error("No audio chunks to combine");
  const parts = await Promise.all(chunks.map((chunk) => chunk.arrayBuffer()));
  const wavParts = parts.map((part) => parseWav(new Uint8Array(part)));
  const first = wavParts[0];
  const header = first.bytes.slice(0, first.dataOffset);
  const dataSize = wavParts.reduce((total, part) => total + part.dataSize, 0);
  const output = new Uint8Array(header.length + dataSize);
  output.set(header);
  let offset = header.length;
  for (const part of wavParts) {
    output.set(
      part.bytes.slice(part.dataOffset, part.dataOffset + part.dataSize),
      offset,
    );
    offset += part.dataSize;
  }
  const view = new DataView(output.buffer);
  view.setUint32(4, output.length - 8, true);
  view.setUint32(first.sizeFieldOffset, dataSize, true);
  return new Blob([output], { type: "audio/wav" });
}
