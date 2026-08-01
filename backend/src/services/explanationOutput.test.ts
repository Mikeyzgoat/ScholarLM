import { describe, expect, test } from "bun:test";
import { env } from "../env";
import {
  explainCanvasSelection,
  explainSelectedText,
  generateCanvasVoiceExplanation,
  hasUsefulVoiceExplanation,
  normalizeExplanationIntent,
} from "./openRouter";

function streamedJson(value: unknown): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(value) } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("hasUsefulVoiceExplanation", () => {
  test("rejects a missing spoken explanation", () => {
    expect(hasUsefulVoiceExplanation("dy/dx = 3x² sin x", undefined)).toBe(
      false,
    );
  });

  test("rejects narration that merely duplicates the written answer", () => {
    expect(
      hasUsefulVoiceExplanation(
        "dy/dx = 3x² sin x",
        "  DY/DX   = 3x² sin x  ",
      ),
    ).toBe(false);
  });

  test("accepts a distinct teacher-style explanation", () => {
    expect(
      hasUsefulVoiceExplanation(
        "dy/dx = 3x² sin x + x³ cos x",
        "We use the product rule because x cubed and sine x both depend on x. Differentiate each factor in turn while keeping the other one unchanged.",
      ),
    ).toBe(true);
  });

  test("returns visual math before generating missing narration", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = env.OPENROUTER_API_KEY;
    const requests: string[] = [];
    env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = (async (_url, init) => {
      requests.push(String(init?.body));
      return requests.length === 1
        ? streamedJson({
            recognizedEquation: "y = x^3 sin x",
            answer: "dy/dx = 3x² sin x + x³ cos x",
            explanation: "dy/dx = 3x² sin x + x³ cos x",
          })
        : streamedJson({
            voiceExplanation:
              "We use the product rule because both factors depend on x. First differentiate x cubed, then differentiate sine x, keeping the other factor unchanged each time.",
          });
    }) as typeof fetch;
    try {
      const result = await explainCanvasSelection({
        selectedText: "y = x^3 sin x",
      });
      expect(requests).toHaveLength(1);
      expect(result.answer).toBe("dy/dx = 3x² sin x + x³ cos x");
      expect(result.voiceExplanation).toBeUndefined();
      const voiceExplanation = await generateCanvasVoiceExplanation({
        answer: result.answer!,
        recognizedEquation: result.recognizedEquation,
      });
      expect(requests).toHaveLength(2);
      expect(voiceExplanation).toContain("product rule");
    } finally {
      globalThis.fetch = originalFetch;
      env.OPENROUTER_API_KEY = originalKey;
    }
  });
});

describe("normalizeExplanationIntent", () => {
  test("keeps supported intent values", () => {
    expect(normalizeExplanationIntent("theory")).toBe("theory");
    expect(normalizeExplanationIntent("problem-solving")).toBe(
      "problem-solving",
    );
  });

  test("normalizes common model variants", () => {
    expect(normalizeExplanationIntent("Conceptual Explanation")).toBe(
      "theory",
    );
    expect(normalizeExplanationIntent("problem_solving")).toBe(
      "problem-solving",
    );
    expect(normalizeExplanationIntent("mathematical calculation")).toBe(
      "math",
    );
  });

  test("falls back safely instead of discarding a valid answer", () => {
    expect(normalizeExplanationIntent("educational-response")).toBe("theory");
    expect(normalizeExplanationIntent("unexpected-category")).toBe("general");
    expect(normalizeExplanationIntent(undefined)).toBe("general");
  });

  test("preserves a generated explanation with a nonstandard intent", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = env.OPENROUTER_API_KEY;
    env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = (async (_url, _init) =>
      streamedJson({
        intent: "conceptual explanation",
        answer: "Osmosis is the movement of water across a selective membrane.",
        voiceExplanation:
          "Think of water moving toward the side with more dissolved particles until the imbalance is reduced.",
      })) as typeof fetch;
    try {
      const result = await explainSelectedText({
        selectedText: "what is osmosis",
      });
      expect(result.intent).toBe("theory");
      expect(result.answer).toContain("Osmosis");
    } finally {
      globalThis.fetch = originalFetch;
      env.OPENROUTER_API_KEY = originalKey;
    }
  });
});
