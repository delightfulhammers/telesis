import type { ReviewFinding, ReviewSession } from "../agent/review/types.js";
import type { DriftReport } from "../drift/types.js";

/** The hidden HTML marker used for idempotent drift comment updates. */
export const DRIFT_COMMENT_MARKER = "<!-- telesis:drift -->";

/**
 * Formats a single review finding as a GitHub-flavored markdown comment body.
 */
export const formatFindingComment = (finding: ReviewFinding): string => {
  const lines: string[] = [];

  lines.push(`**[${finding.severity}]** ${finding.category}`);
  lines.push("");
  lines.push(finding.description);

  if (finding.suggestion) {
    lines.push("");
    lines.push(`> **Suggestion:** ${finding.suggestion}`);
  }

  if (finding.persona) {
    lines.push("");
    lines.push(`_— ${finding.persona} persona_`);
  }

  return lines.join("\n");
};

/**
 * Formats the review summary body for a PR review.
 * Contains header info, summary-only findings, and stats.
 */
export const formatReviewSummaryBody = (
  session: ReviewSession,
  inlineFindings: readonly ReviewFinding[],
  summaryFindings: readonly ReviewFinding[],
  extra?: { mergedCount?: number },
): string => {
  const lines: string[] = [];

  lines.push("## Telesis Review");
  lines.push("");
  lines.push(`**Ref:** \`${session.ref}\``);

  if (session.personas && session.personas.length > 0) {
    lines.push(`**Personas:** ${session.personas.join(", ")}`);
  }

  if (session.themes && session.themes.length > 0) {
    lines.push(`**Themes injected:** ${session.themes.join(", ")}`);
  }

  // Summary findings (those without line info)
  if (summaryFindings.length > 0) {
    lines.push("");
    lines.push("### Summary Findings");
    lines.push("");

    const bySeverity = groupBySeverity(summaryFindings);
    for (const [severity, findings] of bySeverity) {
      lines.push(`**${severity}:**`);
      for (const f of findings) {
        const persona = f.persona ? ` _(${f.persona})_` : "";
        lines.push(`- \`${f.path}\`: ${f.description}${persona}`);
      }
      lines.push("");
    }
  }

  // Stats
  const totalFindings = inlineFindings.length + summaryFindings.length;
  const statParts: string[] = [
    `${totalFindings} findings`,
    `${inlineFindings.length} inline`,
    `${summaryFindings.length} summary`,
  ];
  if (extra?.mergedCount && extra.mergedCount > 0) {
    statParts.push(`${extra.mergedCount} merged`);
  }

  lines.push("---");
  lines.push(`_${statParts.join(", ")}_`);

  return lines.join("\n");
};

/**
 * Formats a drift report as a GitHub-flavored markdown PR comment.
 * Includes a hidden marker for idempotent updates.
 */
export const formatDriftComment = (report: DriftReport): string => {
  const lines: string[] = [];

  lines.push(DRIFT_COMMENT_MARKER);
  lines.push("## Telesis Drift Report");
  lines.push("");
  lines.push("| Check | Status | Details |");
  lines.push("|-------|--------|---------|");

  for (const check of report.checks) {
    const status = check.passed
      ? "PASS"
      : check.severity === "warning"
        ? "WARN"
        : "FAIL";
    const icon = check.passed
      ? "✅"
      : check.severity === "warning"
        ? "⚠️"
        : "❌";
    const details = check.passed
      ? "—"
      : check.details.map((d) => `\`${escapePipe(d)}\``).join(", ");
    lines.push(`| ${check.check} | ${icon} ${status} | ${details} |`);
  }

  lines.push("");

  const { passed, failed, warnings } = report.summary;
  const parts: string[] = [`${passed} passed`, `${failed} failed`];
  if (warnings > 0) {
    parts.push(`${warnings} warnings`);
  }
  lines.push(`**Result:** ${parts.join(", ")}`);

  return lines.join("\n");
};

// --- Helpers ---

const escapePipe = (s: string): string => s.replace(/\|/g, "\\|");

type Severity = ReviewFinding["severity"];

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const groupBySeverity = (
  findings: readonly ReviewFinding[],
): readonly [Severity, readonly ReviewFinding[]][] => {
  const groups = new Map<Severity, ReviewFinding[]>();
  for (const f of findings) {
    const existing = groups.get(f.severity) ?? [];
    existing.push(f);
    groups.set(f.severity, existing);
  }
  return [...groups.entries()].sort(
    ([a], [b]) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b],
  );
};
