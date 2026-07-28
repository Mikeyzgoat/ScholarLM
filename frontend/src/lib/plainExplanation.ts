export function cleanExplanation(value: string): string {
  return value
    .replace(/```[a-z]*\s*/gi, "")
    .replace(/```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, "")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\times\b/g, "×")
    .replace(/\\cdot\b/g, "·")
    .replace(/\\leq?\b/g, "≤")
    .replace(/\\geq?\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\\pm\b/g, "±")
    .replace(/\\infty\b/g, "∞")
    .replace(/\\sum\b/g, "∑")
    .replace(/\s*<ANSWER_SPLIT>\s*/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
