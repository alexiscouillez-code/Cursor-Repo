import { describe, expect, it } from "vitest";
import { isGeminiConfigured } from "@/lib/ai/gemini";

describe("gemini config", () => {
  it("reports configuration from env without exposing key", () => {
    const before = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    expect(isGeminiConfigured()).toBe(true);
    if (before === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before;
  });
});
