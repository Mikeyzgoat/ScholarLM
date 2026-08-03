import { describe, expect, test } from "bun:test";
import { buildModelFallbacks } from "./modelRouting";
import { isRetryableGenerationError } from "./openRouter";

describe("buildModelFallbacks", () => {
  test("never sends more than OpenRouter's three-model limit", () => {
    expect(
      buildModelFallbacks("primary:free", [
        "fallback-one:free",
        "fallback-two:free",
        "fallback-three:free",
        "openrouter/free",
      ]),
    ).toEqual(["primary:free", "fallback-one:free", "openrouter/free"]);
  });

  test("removes duplicate and automatic-router entries", () => {
    expect(
      buildModelFallbacks("primary:free", [
        "primary:free",
        "openrouter/auto",
        "fallback:free",
      ]),
    ).toEqual(["primary:free", "fallback:free"]);
  });

  test("uses the free router when automatic routing has no candidates", () => {
    expect(buildModelFallbacks("openrouter/auto", [])).toEqual([
      "openrouter/free",
    ]);
  });
});

describe("isRetryableGenerationError", () => {
  test("retries a provider moderation false positive on another model", () => {
    expect(
      isRetryableGenerationError(
        "Upstream error from Alibaba: Output data may contain inappropriate content",
      ),
    ).toBe(true);
  });

  test("does not retry a daily usage limit", () => {
    expect(isRetryableGenerationError("Per-day rate limit exceeded")).toBe(
      false,
    );
  });
});
