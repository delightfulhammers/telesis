import type { DriftFinding, DriftReport } from "./types.js";

const HEADER_LINE = "═".repeat(50);
const DIVIDER_LINE = "─".repeat(50);

const indicator = (finding: DriftFinding): string =>
  finding.passed ? "✓" : "✗";

const padName = (name: string): string => name.padEnd(36);

const statusLabel = (finding: DriftFinding): string =>
  finding.passed ? "PASS" : finding.severity === "warning" ? "WARN" : "FAIL";

const formatFinding = (finding: DriftFinding): string => {
  const lines: string[] = [];
  lines.push(
    `  ${indicator(finding)} ${padName(finding.check)}${statusLabel(finding)}`,
  );

  if (!finding.passed) {
    for (const detail of finding.details) {
      lines.push(`      ${detail}`);
    }
  }

  return lines.join("\n");
};

/**
 * Formats a drift report as a human-readable terminal string.
 */
export const formatDriftReport = (report: DriftReport): string => {
  const lines: string[] = [];

  lines.push("Drift Report");
  lines.push(HEADER_LINE);
  lines.push("");

  for (const finding of report.checks) {
    lines.push(formatFinding(finding));
  }

  lines.push("");
  lines.push(DIVIDER_LINE);

  const { passed, failed, warnings } = report.summary;
  const parts: string[] = [`${passed} passed`, `${failed} failed`];
  if (warnings > 0) {
    parts.push(`${warnings} warnings`);
  }
  lines.push(`Result: ${parts.join(", ")}`);

  return lines.join("\n");
};
