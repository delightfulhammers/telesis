import type { MilestoneCheckReport, CheckResult } from "./check.js";

const HEADER_LINE = "═".repeat(50);
const DIVIDER_LINE = "─".repeat(50);

const formatAutoResult = (result: CheckResult): string => {
  const indicator = result.passed ? "✓" : "✗";
  const label = result.passed ? "PASS" : "FAIL";
  return `  ${indicator} ${result.name.padEnd(36)}${label}`;
};

const formatManualResult = (result: CheckResult): string =>
  `  ? ${result.name}`;

export const formatCheckReport = (report: MilestoneCheckReport): string => {
  const lines: string[] = [];

  lines.push(`Milestone Check: ${report.milestone}`);
  lines.push(HEADER_LINE);
  lines.push("");

  const autoResults = report.results.filter((r) => r.kind === "auto");
  const manualResults = report.results.filter((r) => r.kind === "manual");

  lines.push("  Automated Checks");
  lines.push(`  ${"─".repeat(18)}`);
  for (const r of autoResults) {
    lines.push(formatAutoResult(r));
  }

  if (manualResults.length > 0) {
    lines.push("");
    lines.push("  Acceptance Criteria (manual confirmation)");
    lines.push(`  ${"─".repeat(42)}`);
    for (const r of manualResults) {
      lines.push(formatManualResult(r));
    }
  }

  lines.push("");
  lines.push(DIVIDER_LINE);

  const autoPassCount = autoResults.filter((r) => r.passed).length;
  const autoTotal = autoResults.length;
  const parts: string[] = [];
  parts.push(
    autoPassCount === autoTotal
      ? `${autoTotal} auto checks passed`
      : `${autoPassCount}/${autoTotal} auto checks passed`,
  );
  if (manualResults.length > 0) {
    parts.push(`${manualResults.length} criteria require manual confirmation`);
  }
  lines.push(`Result: ${parts.join(". ")}.`);

  return lines.join("\n");
};
