import { describe, it, expect } from "vitest";
import { DISMISSAL_REASONS, isValidDismissalReason } from "./types.js";

describe("DISMISSAL_REASONS", () => {
  it("contains expected reasons", () => {
    expect(DISMISSAL_REASONS).toContain("false-positive");
    expect(DISMISSAL_REASONS).toContain("not-actionable");
    expect(DISMISSAL_REASONS).toContain("already-addressed");
    expect(DISMISSAL_REASONS).toContain("style-preference");
    expect(DISMISSAL_REASONS).toHaveLength(4);
  });
});

describe("isValidDismissalReason", () => {
  it("accepts valid reasons", () => {
    for (const reason of DISMISSAL_REASONS) {
      expect(isValidDismissalReason(reason)).toBe(true);
    }
  });

  it("rejects invalid reasons", () => {
    expect(isValidDismissalReason("invalid")).toBe(false);
    expect(isValidDismissalReason("")).toBe(false);
    expect(isValidDismissalReason("FALSE-POSITIVE")).toBe(false);
  });
});
