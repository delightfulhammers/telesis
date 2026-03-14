import { describe, it, expect } from "vitest";
import { boundDiff } from "./diff-utils.js";

describe("boundDiff", () => {
  it("returns diff unchanged when under limit", () => {
    const diff = "short diff";
    expect(boundDiff(diff, 1000)).toBe(diff);
  });

  it("returns diff unchanged when exactly at limit", () => {
    const diff = "x".repeat(500);
    expect(boundDiff(diff, 500)).toBe(diff);
  });

  it("truncates and appends note when over limit", () => {
    const diff = "y".repeat(2000);
    const result = boundDiff(diff, 1000);

    expect(result).toContain("y".repeat(1000));
    expect(result).toContain("[diff truncated");
    expect(result).toContain("1k characters");
    expect(result.length).toBeLessThan(2000);
  });

  it("rounds truncation size to nearest k", () => {
    const diff = "z".repeat(25_000);
    const result = boundDiff(diff, 20_000);

    expect(result).toContain("20k characters");
  });
});
