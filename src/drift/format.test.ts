import { describe, it, expect } from "vitest";
import type { DriftReport } from "./types.js";
import { formatDriftReport } from "./format.js";

describe("formatDriftReport", () => {
  it("formats an all-passing report", () => {
    const report: DriftReport = {
      checks: [
        {
          check: "my-check",
          passed: true,
          message: "All good",
          severity: "error",
          details: [],
        },
      ],
      passed: true,
      summary: { total: 1, passed: 1, failed: 0, warnings: 0 },
    };

    const output = formatDriftReport(report);
    expect(output).toContain("Drift Report");
    expect(output).toContain("✓");
    expect(output).toContain("my-check");
    expect(output).toContain("PASS");
    expect(output).toContain("1 passed, 0 failed");
  });

  it("formats a failing report with details", () => {
    const report: DriftReport = {
      checks: [
        {
          check: "bad-check",
          passed: false,
          message: "Found violations",
          severity: "error",
          details: ["src/foo.ts:5 violation"],
        },
      ],
      passed: false,
      summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
    };

    const output = formatDriftReport(report);
    expect(output).toContain("✗");
    expect(output).toContain("FAIL");
    expect(output).toContain("src/foo.ts:5 violation");
    expect(output).toContain("0 passed, 1 failed");
  });

  it("shows WARN status for warning-severity findings", () => {
    const report: DriftReport = {
      checks: [
        {
          check: "warn-check",
          passed: false,
          message: "Missing stuff",
          severity: "warning",
          details: ["detail"],
        },
      ],
      passed: true,
      summary: { total: 1, passed: 0, failed: 0, warnings: 1 },
    };

    const output = formatDriftReport(report);
    expect(output).toContain("WARN");
    expect(output).toContain("1 warnings");
  });
});
