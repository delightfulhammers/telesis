import { createScanContext } from "./scan-context.js";
import type {
  DriftCheck,
  DriftFinding,
  DriftReport,
  DriftSummary,
} from "./types.js";

/**
 * Runs the given drift checks against `rootDir` and produces an aggregated report.
 * If `filter` is provided, only checks whose names appear in the filter are run.
 * A shared ScanContext is created once and passed to all checks to avoid redundant
 * filesystem traversals.
 */
export const runChecks = (
  checks: readonly DriftCheck[],
  rootDir: string,
  filter?: readonly string[],
): DriftReport => {
  const selected = filter
    ? checks.filter((c) => filter.includes(c.name))
    : checks;

  const ctx = createScanContext(rootDir);

  const findings: DriftFinding[] = selected.map((check) => {
    try {
      return check.run(rootDir, ctx);
    } catch (err) {
      return {
        check: check.name,
        passed: false,
        message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        severity: "error" as const,
        details: [],
      };
    }
  });

  const failed = findings.filter(
    (f) => !f.passed && f.severity === "error",
  ).length;
  const warnings = findings.filter(
    (f) => !f.passed && f.severity !== "error",
  ).length;

  const summary: DriftSummary = {
    total: findings.length,
    passed: findings.length - failed - warnings,
    failed,
    warnings,
  };

  return { checks: findings, passed: failed === 0, summary };
};
