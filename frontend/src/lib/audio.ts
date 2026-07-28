function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1)
    view.setUint8(offset + index, value.charCodeAt(index));
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const sampleCount = buffer.length;
  const bytesPerSample = 2;
  const dataSize = sampleCount * channels * bytesPerSample;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = Array.from(
    { length: channels },
    (_, channel) => buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, channelData[channel][sample]));
      view.setInt16(
        offset,
        value < 0 ? value * 0x8000 : value * 0x7fff,
        true,
      );
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

export async function combineWavChunks(chunks: Blob[]): Promise<Blob> {
  if (!chunks.length) throw new Error("No audio chunks to combine");
  const context = new AudioContext();
  try {
    const decoded = await Promise.all(
      chunks.map(async (chunk) =>
        context.decodeAudioData(await chunk.arrayBuffer()),
      ),
    );
    const sampleRate = decoded[0].sampleRate;
    const channels = decoded[0].numberOfChannels;
    if (
      decoded.some(
        (buffer) =>
          buffer.sampleRate !== sampleRate ||
          buffer.numberOfChannels !== channels,
      )
    )
      throw new Error("Kokoro returned incompatible audio chunks");
    const combined = context.createBuffer(
      channels,
      decoded.reduce((total, buffer) => total + buffer.length, 0),
      sampleRate,
    );
    let offset = 0;
    for (const buffer of decoded) {
      for (let channel = 0; channel < channels; channel += 1)
        combined.copyToChannel(buffer.getChannelData(channel), channel, offset);
      offset += buffer.length;
    }
    return encodeWav(combined);
  } finally {
    await context.close();
  }
}
