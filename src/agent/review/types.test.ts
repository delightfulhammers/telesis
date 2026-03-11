import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIDENCE_THRESHOLDS } from "./types.js";

describe("DEFAULT_CONFIDENCE_THRESHOLDS", () => {
  it("has inverse severity relationship", () => {
    // Lower severity requires higher confidence to survive
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.critical).toBeLessThan(
      DEFAULT_CONFIDENCE_THRESHOLDS.high,
    );
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.high).toBeLessThan(
      DEFAULT_CONFIDENCE_THRESHOLDS.medium,
    );
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.medium).toBeLessThan(
      DEFAULT_CONFIDENCE_THRESHOLDS.low,
    );
  });

  it("has expected default values", () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.critical).toBe(50);
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.high).toBe(60);
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.medium).toBe(70);
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.low).toBe(80);
  });
});
