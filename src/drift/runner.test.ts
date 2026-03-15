import { describe, it, expect } from "vitest";
import type { DriftCheck } from "./types.js";
import { runChecks } from "./runner.js";

const passingCheck: DriftCheck = {
  name: "always-pass",
  description: "A check that always passes",
  requiresModel: false,
  run: () => ({
    check: "always-pass",
    passed: true,
    message: "All good",
    severity: "error",
    details: [],
  }),
};

const failingError: DriftCheck = {
  name: "always-fail",
  description: "A check that always fails with error",
  requiresModel: false,
  run: () => ({
    check: "always-fail",
    passed: false,
    message: "Something wrong",
    severity: "error",
    details: ["violation 1", "violation 2"],
  }),
};

const failingWarning: DriftCheck = {
  name: "always-warn",
  description: "A check that always warns",
  requiresModel: false,
  run: () => ({
    check: "always-warn",
    passed: false,
    message: "Not ideal",
    severity: "warning",
    details: ["suggestion 1"],
  }),
};

describe("runChecks", () => {
  it("aggregates all passing checks", () => {
    const report = runChecks([passingCheck], "/tmp");
    expect(report.passed).toBe(true);
    expect(report.summary).toEqual({
      total: 1,
      passed: 1,
      failed: 0,
      warnings: 0,
    });
  });

  it("reports failure when any error-severity check fails", () => {
    const report = runChecks([passingCheck, failingError], "/tmp");
    expect(report.passed).toBe(false);
    expect(report.summary.failed).toBe(1);
  });

  it("passes when only warnings fail (no errors)", () => {
    const report = runChecks([passingCheck, failingWarning], "/tmp");
    expect(report.passed).toBe(true);
    expect(report.summary.warnings).toBe(1);
  });

  it("filters checks by name", () => {
    const report = runChecks([passingCheck, failingError], "/tmp", [
      "always-pass",
    ]);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].check).toBe("always-pass");
    expect(report.passed).toBe(true);
  });

  it("returns empty report when filter matches nothing", () => {
    const report = runChecks([passingCheck], "/tmp", ["nonexistent"]);
    expect(report.checks).toHaveLength(0);
    expect(report.passed).toBe(true);
    expect(report.summary.total).toBe(0);
  });

  it("converts thrown exceptions into error findings", () => {
    const throwingCheck: DriftCheck = {
      name: "throws",
      description: "A check that throws",
      requiresModel: false,
      run: () => {
        throw new Error("boom");
      },
    };
    const report = runChecks([passingCheck, throwingCheck], "/tmp");
    expect(report.passed).toBe(false);
    expect(report.checks[1].check).toBe("throws");
    expect(report.checks[1].passed).toBe(false);
    expect(report.checks[1].message).toContain("boom");
    expect(report.checks[1].severity).toBe("error");
  });

  describe("language filtering", () => {
    const tsCheck: DriftCheck = {
      name: "ts-only",
      description: "TypeScript-specific check",
      requiresModel: false,
      languages: ["TypeScript"],
      run: () => ({
        check: "ts-only",
        passed: true,
        message: "OK",
        severity: "error",
        details: [],
      }),
    };

    const universalCheck: DriftCheck = {
      name: "universal",
      description: "Universal check",
      requiresModel: false,
      run: () => ({
        check: "universal",
        passed: true,
        message: "OK",
        severity: "error",
        details: [],
      }),
    };

    it("skips TS check when project is Go", () => {
      const report = runChecks([tsCheck, universalCheck], "/tmp", undefined, [
        "Go",
      ]);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0].check).toBe("universal");
    });

    it("runs TS check when project includes TypeScript", () => {
      const report = runChecks([tsCheck, universalCheck], "/tmp", undefined, [
        "TypeScript",
      ]);
      expect(report.checks).toHaveLength(2);
    });

    it("runs TS check when project is multi-language including TypeScript", () => {
      const report = runChecks([tsCheck, universalCheck], "/tmp", undefined, [
        "TypeScript",
        "Go",
      ]);
      expect(report.checks).toHaveLength(2);
    });

    it("runs universal check for any project language", () => {
      const report = runChecks([universalCheck], "/tmp", undefined, ["Python"]);
      expect(report.checks).toHaveLength(1);
    });

    it("runs all checks when projectLanguages is undefined (backward compat)", () => {
      const report = runChecks([tsCheck, universalCheck], "/tmp");
      expect(report.checks).toHaveLength(2);
    });

    it("runs all checks when projectLanguages is empty", () => {
      const report = runChecks(
        [tsCheck, universalCheck],
        "/tmp",
        undefined,
        [],
      );
      expect(report.checks).toHaveLength(2);
    });
  });
});
