import { describe, expect, test } from "bun:test";
import { normalizeSpeechText } from "./speechCache";

describe("normalizeSpeechText", () => {
  test("converts visual math symbols into spoken English", () => {
    expect(normalizeSpeechText("x² + π = √y × 3")).toBe(
      "x squared + pi equals square root of y times 3",
    );
  });

  test("speaks comparison and division symbols naturally", () => {
    expect(normalizeSpeechText("a ≤ b; a ≠ b ÷ 2")).toBe(
      "a less than or equal to b; a not equal to b divided by 2",
    );
  });
});
