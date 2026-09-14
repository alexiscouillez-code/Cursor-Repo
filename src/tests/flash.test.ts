import { describe, expect, it } from "vitest";

/**
 * Torch capability detection mirrors ScannerPanel helpers.
 * Kept as pure logic for unit coverage without browser MediaStream.
 */
function trackSupportsTorch(
  caps: (MediaTrackCapabilities & { torch?: boolean }) | undefined,
): boolean {
  return Boolean(caps && "torch" in caps && caps.torch);
}

describe("camera flash support", () => {
  it("detects torch capability when present", () => {
    expect(trackSupportsTorch({ torch: true })).toBe(true);
  });

  it("rejects tracks without torch", () => {
    expect(trackSupportsTorch({})).toBe(false);
    expect(trackSupportsTorch(undefined)).toBe(false);
  });
});
