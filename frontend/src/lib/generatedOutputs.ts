const storageKey = "scholarlm-generated-output-map";
const maximumRecords = 500;

export interface GeneratedOutputRecord {
  id: string;
  kind: "explanation";
  text: string;
  sourceText: string;
  pageNumber?: number;
  createdAt: string;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readRecords(): Record<string, GeneratedOutputRecord> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return value && typeof value === "object"
      ? (value as Record<string, GeneratedOutputRecord>)
      : {};
  } catch {
    return {};
  }
}

export function registerGeneratedOutput(input: {
  text: string;
  sourceText: string;
  pageNumber?: number;
}): GeneratedOutputRecord {
  const id = `explanation:${hashText(
    `${input.pageNumber ?? "canvas"}:${input.sourceText}:${input.text}`,
  )}`;
  const records = readRecords();
  const record: GeneratedOutputRecord = {
    id,
    kind: "explanation",
    text: input.text,
    sourceText: input.sourceText,
    pageNumber: input.pageNumber,
    createdAt: records[id]?.createdAt ?? new Date().toISOString(),
  };
  records[id] = record;
  const trimmed = Object.fromEntries(
    Object.values(records)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, maximumRecords)
      .map((item) => [item.id, item]),
  );
  try {
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch (error) {
    console.warn("Could not persist the generated-output map", error);
  }
  return record;
}

export function isGeneratedExplanationShape(shape: {
  type: string;
  meta?: unknown;
  props: unknown;
}): boolean {
  const meta =
    shape.meta && typeof shape.meta === "object"
      ? (shape.meta as Record<string, unknown>)
      : {};
  if (
    meta.scholarLmGenerated === true &&
    meta.scholarLmOutputKind === "explanation"
  )
    return true;
  const props =
    shape.props && typeof shape.props === "object"
      ? (shape.props as Record<string, unknown>)
      : {};
  return (
    shape.type === "text" &&
    props.color === "orange" &&
    props.w === 420
  );
}
