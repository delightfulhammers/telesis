import { describe, it, expect } from "vitest";
import { formatCheckReport } from "./format.js";
import type { MilestoneCheckReport } from "./check.js";

describe("formatCheckReport", () => {
  it("formats all auto checks passing", () => {
    const report: MilestoneCheckReport = {
      milestone: "v0.9.0 — Milestone Validation",
      passed: true,
      results: [
        { name: "drift-clean", kind: "auto", passed: true, message: "PASS" },
        { name: "tests-pass", kind: "auto", passed: true, message: "PASS" },
        {
          name: "build-succeeds",
          kind: "auto",
          passed: true,
          message: "PASS",
        },
        { name: "lint-passes", kind: "auto", passed: true, message: "PASS" },
      ],
    };

    const output = formatCheckReport(report);
    expect(output).toContain("Milestone Check: v0.9.0");
    expect(output).toContain("✓ drift-clean");
    expect(output).toContain("✓ tests-pass");
    expect(output).toContain("4 auto checks passed");
  });

  it("formats auto check failure", () => {
    const report: MilestoneCheckReport = {
      milestone: "v0.9.0 — Test",
      passed: false,
      results: [
        { name: "drift-clean", kind: "auto", passed: true, message: "PASS" },
        { name: "tests-pass", kind: "auto", passed: false, message: "FAIL" },
        {
          name: "build-succeeds",
          kind: "auto",
          passed: true,
          message: "PASS",
        },
        { name: "lint-passes", kind: "auto", passed: true, message: "PASS" },
      ],
    };

    const output = formatCheckReport(report);
    expect(output).toContain("✗ tests-pass");
    expect(output).toContain("3/4 auto checks passed");
  });

  it("formats manual criteria with ? marker", () => {
    const report: MilestoneCheckReport = {
      milestone: "v0.9.0 — Test",
      passed: true,
      results: [
        { name: "drift-clean", kind: "auto", passed: true, message: "PASS" },
        {
          name: "Check works",
          kind: "manual",
          passed: false,
          message: "requires manual confirmation",
        },
        {
          name: "Complete works",
          kind: "manual",
          passed: false,
          message: "requires manual confirmation",
        },
      ],
    };

    const output = formatCheckReport(report);
    expect(output).toContain("? Check works");
    expect(output).toContain("? Complete works");
    expect(output).toContain("Acceptance Criteria (manual confirmation)");
  });

  it("shows summary counts", () => {
    const report: MilestoneCheckReport = {
      milestone: "v0.9.0 — Test",
      passed: true,
      results: [
        { name: "drift-clean", kind: "auto", passed: true, message: "PASS" },
        { name: "tests-pass", kind: "auto", passed: true, message: "PASS" },
        {
          name: "Criterion A",
          kind: "manual",
          passed: false,
          message: "requires manual confirmation",
        },
        {
          name: "Criterion B",
          kind: "manual",
          passed: false,
          message: "requires manual confirmation",
        },
        {
          name: "Criterion C",
          kind: "manual",
          passed: false,
          message: "requires manual confirmation",
        },
      ],
    };

    const output = formatCheckReport(report);
    expect(output).toContain("2 auto checks passed");
    expect(output).toContain("3 criteria require manual confirmation");
  });

  it("omits manual section when no criteria", () => {
    const report: MilestoneCheckReport = {
      milestone: "v0.9.0 — Test",
      passed: true,
      results: [
        { name: "drift-clean", kind: "auto", passed: true, message: "PASS" },
      ],
    };

    const output = formatCheckReport(report);
    expect(output).not.toContain("Acceptance Criteria");
    expect(output).not.toContain("manual confirmation");
  });
});
