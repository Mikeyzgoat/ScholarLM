import { describe, expect, test } from "bun:test";
import { buildModelFallbacks } from "./modelRouting";

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
