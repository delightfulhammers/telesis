import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  formatFindingLocation,
} from "./types.js";

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

describe("formatFindingLocation", () => {
  it("formats multi-line range", () => {
    expect(
      formatFindingLocation({ path: "src/foo.ts", startLine: 10, endLine: 20 }),
    ).toBe("src/foo.ts:10-20");
  });

  it("formats single line when startLine equals endLine", () => {
    expect(
      formatFindingLocation({ path: "src/foo.ts", startLine: 10, endLine: 10 }),
    ).toBe("src/foo.ts:10");
  });

  it("formats single line when endLine is undefined", () => {
    expect(formatFindingLocation({ path: "src/foo.ts", startLine: 10 })).toBe(
      "src/foo.ts:10",
    );
  });

  it("formats path only when no line info", () => {
    expect(formatFindingLocation({ path: "src/foo.ts" })).toBe("src/foo.ts");
  });
});
