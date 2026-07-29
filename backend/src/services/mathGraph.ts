export interface DeterministicMathPlot {
  title: string;
  xLabel: string;
  yLabel: string;
  points: Array<{ x: number; y: number }>;
  segments?: Array<Array<{ x: number; y: number }>>;
}

export interface MathGraphResult {
  normalizedEquation: string;
  classification: "graph" | "unsupported";
  plot?: DeterministicMathPlot;
  error?: string;
}

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "left" | "right" };

const functions: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√([a-z0-9.]+)/g, "sqrt($1)")
    .replace(/\bpi\b|π/g, "pi")
    .replace(/\s+/g, "");
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
    if (number) {
      tokens.push({ type: "number", value: Number(number) });
      index += number.length;
      continue;
    }
    const identifier = rest.match(/^[a-z]+/)?.[0];
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier });
      index += identifier.length;
      continue;
    }
    const character = source[index];
    if ("+-*/^".includes(character)) {
      tokens.push({ type: "operator", value: character });
      index += 1;
      continue;
    }
    if (character === "(" || character === ")") {
      tokens.push({ type: character === "(" ? "left" : "right" });
      index += 1;
      continue;
    }
    throw new Error(`Unsupported symbol "${character}"`);
  }
  return tokens;
}

function compileExpression(source: string): (x: number) => number {
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const primary = (): ((x: number) => number) => {
    const token = take();
    if (!token) throw new Error("Incomplete expression");
    if (token.type === "number") return () => token.value;
    if (token.type === "left") {
      const value = expression();
      if (take()?.type !== "right") throw new Error("Missing closing bracket");
      return value;
    }
    if (token.type !== "identifier")
      throw new Error("Expected a number, variable, or function");
    if (token.value === "x") return (x) => x;
    if (token.value === "pi") return () => Math.PI;
    if (token.value === "e") return () => Math.E;
    const fn = functions[token.value];
    if (!fn) throw new Error(`Unsupported name "${token.value}"`);
    if (take()?.type !== "left")
      throw new Error(`${token.value} requires brackets`);
    const argument = expression();
    if (take()?.type !== "right") throw new Error("Missing closing bracket");
    return (x) => fn(argument(x));
  };
  const power = (): ((x: number) => number) => {
    const left = primary();
    const token = peek();
    if (token?.type !== "operator" || token.value !== "^") return left;
    take();
    const right = unary();
    return (x) => left(x) ** right(x);
  };
  const unary = (): ((x: number) => number) => {
    const token = peek();
    if (token?.type === "operator" && ["+", "-"].includes(token.value)) {
      take();
      const value = unary();
      return token.value === "-" ? (x) => -value(x) : value;
    }
    return power();
  };
  const beginsImplicitFactor = (token: Token | undefined) =>
    token?.type === "number" ||
    token?.type === "identifier" ||
    token?.type === "left";
  const term = (): ((x: number) => number) => {
    let left = unary();
    while (true) {
      const token = peek();
      const explicit =
        token?.type === "operator" && ["*", "/"].includes(token.value);
      if (!explicit && !beginsImplicitFactor(token)) break;
      const operator = explicit ? (take() as { value: string }).value : "*";
      const right = unary();
      const previous = left;
      left =
        operator === "*"
          ? (x) => previous(x) * right(x)
          : (x) => previous(x) / right(x);
    }
    return left;
  };
  const expression = (): ((x: number) => number) => {
    let left = term();
    while (true) {
      const token = peek();
      if (
        token?.type !== "operator" ||
        !["+", "-"].includes(token.value)
      )
        break;
      take();
      const right = term();
      const previous = left;
      left =
        token.value === "+"
          ? (x) => previous(x) + right(x)
          : (x) => previous(x) - right(x);
    }
    return left;
  };
  const evaluate = expression();
  if (cursor !== tokens.length) throw new Error("Expression was not fully parsed");
  return evaluate;
}

function sampleFunction(
  evaluate: (x: number) => number,
): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  for (let index = 0; index <= 160; index += 1) {
    const x = -10 + (20 * index) / 160;
    const y = evaluate(x);
    const previous = segment.at(-1);
    const invalid =
      !Number.isFinite(y) ||
      Math.abs(y) > 1_000 ||
      (previous !== undefined && Math.abs(y - previous.y) > 50);
    if (invalid) {
      if (segment.length >= 2) segments.push(segment);
      segment = [];
      continue;
    }
    segment.push({ x, y });
  }
  if (segment.length >= 2) segments.push(segment);
  return segments;
}

export function buildDeterministicMathGraph(
  rawEquation: string,
): MathGraphResult {
  const normalizedEquation = normalize(rawEquation);
  const circle = normalizedEquation.match(
    /^x\^2\+y\^2=([0-9]+(?:\.[0-9]+)?)$/,
  );
  if (circle) {
    const radius = Math.sqrt(Number(circle[1]));
    const points = Array.from({ length: 121 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 120;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    return {
      normalizedEquation,
      classification: "graph",
      plot: {
        title: normalizedEquation,
        xLabel: "x",
        yLabel: "y",
        points,
        segments: [points],
      },
    };
  }
  let expression = "";
  if (normalizedEquation.startsWith("y="))
    expression = normalizedEquation.slice(2);
  else if (normalizedEquation.startsWith("f(x)="))
    expression = normalizedEquation.slice(5);
  else if (normalizedEquation.endsWith("=y"))
    expression = normalizedEquation.slice(0, -2);
  else if (!normalizedEquation.includes("=") && normalizedEquation.includes("x"))
    expression = normalizedEquation;
  if (!expression)
    return {
      normalizedEquation,
      classification: "unsupported",
      error:
        "This is not a supported 2D relation. Try y = f(x) or x² + y² = r².",
    };
  try {
    const segments = sampleFunction(compileExpression(expression));
    if (!segments.length)
      throw new Error("No finite points were found in the default domain");
    return {
      normalizedEquation,
      classification: "graph",
      plot: {
        title: normalizedEquation,
        xLabel: "x",
        yLabel: "y",
        points: segments.flat(),
        segments,
      },
    };
  } catch (error) {
    return {
      normalizedEquation,
      classification: "unsupported",
      error:
        error instanceof Error ? error.message : "Equation could not be parsed",
    };
  }
}
