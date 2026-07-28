const adjectives = [
  "amber",
  "brisk",
  "calm",
  "cobalt",
  "cosmic",
  "crimson",
  "frosted",
  "golden",
  "lunar",
  "quiet",
  "sapphire",
  "silver",
];

const nouns = [
  "blade",
  "brook",
  "cedar",
  "comet",
  "falcon",
  "harbor",
  "lotus",
  "maple",
  "orbit",
  "pine",
  "summit",
  "wave",
];

function pick(values: string[]): string {
  return values[crypto.getRandomValues(new Uint32Array(1))[0] % values.length];
}

export function createRandomCanvasName(): string {
  const suffix = (crypto.getRandomValues(new Uint32Array(1))[0] % 9) + 1;
  return `${pick(adjectives)}-${pick(nouns)}-${suffix}`;
}
