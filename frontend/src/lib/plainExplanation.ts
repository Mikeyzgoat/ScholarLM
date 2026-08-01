export function cleanExplanation(value: string): string {
  return value
    .replace(/```[a-z]*\s*/gi, "")
    .replace(/```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)")
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
    .replace(/\\pi\b/g, "π")
    .replace(/\\theta\b/g, "θ")
    .replace(/\\alpha\b/g, "α")
    .replace(/\\beta\b/g, "β")
    .replace(/\\rightarrow\b|\\to\b/g, "→")
    .replace(/\^\{?(-?\d+)\}?/g, (_, power: string) =>
      power.replace(/[\d-]/g, (character) =>
        ({
          "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
          "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻",
        })[character] ?? character),
    )
    .replace(/_\{?(-?\d+)\}?/g, (_, index: string) =>
      index.replace(/[\d-]/g, (character) =>
        ({
          "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
          "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "-": "₋",
        })[character] ?? character),
    )
    .replace(/[{}]/g, "")
    .replace(/\s*<ANSWER_SPLIT>\s*/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
