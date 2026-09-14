import { describe, expect, it } from "vitest";
import { isQuotaError } from "@/lib/store/persistence";

describe("persistence quota helpers", () => {
  it("detects QuotaExceededError by name", () => {
    const err = new Error("The quota has been exceeded.");
    err.name = "QuotaExceededError";
    expect(isQuotaError(err)).toBe(true);
  });

  it("detects quota message text", () => {
    expect(isQuotaError(new Error("The quota has been exceeded."))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isQuotaError(new Error("network failed"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
