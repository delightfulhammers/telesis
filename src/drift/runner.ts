import type {
  DriftCheck,
  DriftFinding,
  DriftReport,
  DriftSummary,
} from "./types.js";

/**
 * Runs the given drift checks against `rootDir` and produces an aggregated report.
 * If `filter` is provided, only checks whose names appear in the filter are run.
 */
export const runChecks = (
  checks: readonly DriftCheck[],
  rootDir: string,
  filter?: readonly string[],
): DriftReport => {
  const selected = filter
    ? checks.filter((c) => filter.includes(c.name))
    : checks;

  const findings: DriftFinding[] = selected.map((check) => check.run(rootDir));

  const summary: DriftSummary = {
    total: findings.length,
    passed: findings.filter((f) => f.passed).length,
    failed: findings.filter((f) => !f.passed && f.severity === "error").length,
    warnings: findings.filter((f) => !f.passed && f.severity === "warning")
      .length,
  };

  const passed = findings.every((f) => f.passed || f.severity !== "error");

  return { checks: findings, passed, summary };
};
