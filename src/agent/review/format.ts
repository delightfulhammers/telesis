import type { ReviewSession, ReviewFinding, Severity } from "./types.js";
import type { Dismissal } from "./dismissal/types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_ICON: Record<Severity, string> = {
  critical: "✗",
  high: "✗",
  medium: "✗",
  low: "·",
};

const formatLocation = (finding: ReviewFinding): string => {
  if (finding.startLine !== undefined && finding.endLine !== undefined) {
    return `${finding.path}:${finding.startLine}-${finding.endLine}`;
  }
  if (finding.startLine !== undefined) {
    return `${finding.path}:${finding.startLine}`;
  }
  return finding.path;
};

const wrapText = (text: string, indent: number, maxWidth: number): string => {
  const prefix = " ".repeat(indent);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = prefix;

  for (const word of words) {
    if (
      current.length + word.length + 1 > maxWidth &&
      current.trim().length > 0
    ) {
      lines.push(current);
      current = prefix + word;
    } else {
      current += (current.trim().length > 0 ? " " : "") + word;
    }
  }
  if (current.trim().length > 0) lines.push(current);
  return lines.join("\n");
};

export const formatFinding = (
  finding: ReviewFinding,
  dismissal?: Dismissal,
): string => {
  const icon = SEVERITY_ICON[finding.severity];
  const dismissed = dismissal ? ` [DISMISSED: ${dismissal.reason}]` : "";
  const header = `  ${icon} [${finding.severity}] ${finding.category} — ${formatLocation(finding)}${dismissed}`;
  const desc = wrapText(finding.description, 4, 72);
  const suggestion = wrapText("Suggestion: " + finding.suggestion, 4, 72);
  return `${header}\n${desc}\n\n${suggestion}`;
};

const formatTokens = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const formatDuration = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
};

const countBySeverity = (findings: readonly ReviewFinding[]): string => {
  const counts: Partial<Record<Severity, number>> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return (["critical", "high", "medium", "low"] as const)
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(", ");
};

const buildSummaryLine = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  cost?: number | null,
): string => {
  const totalTokens =
    session.tokenUsage.inputTokens + session.tokenUsage.outputTokens;
  const costSuffix = cost != null && cost > 0 ? ` · $${cost.toFixed(2)}` : "";
  return findings.length === 0
    ? `0 findings · ${formatTokens(totalTokens)} tokens · ${formatDuration(session.durationMs)}${costSuffix}`
    : `${findings.length} findings (${countBySeverity(findings)}) · ${formatTokens(totalTokens)} tokens · ${formatDuration(session.durationMs)}${costSuffix}`;
};

const sortedFindings = (
  findings: readonly ReviewFinding[],
): readonly ReviewFinding[] =>
  [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

export const formatReviewReport = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  options?: {
    dismissals?: ReadonlyMap<string, Dismissal>;
    cost?: number | null;
  },
): string => {
  const header = `Review: ${session.ref}`;
  const divider = "═".repeat(50);
  const lines: string[] = [header, divider, ""];

  if (findings.length === 0) {
    lines.push("  No findings.");
    lines.push("");
  } else {
    for (const finding of sortedFindings(findings)) {
      lines.push(formatFinding(finding, options?.dismissals?.get(finding.id)));
      lines.push("");
    }
  }

  const separator = "─".repeat(50);
  lines.push(separator);
  lines.push(buildSummaryLine(session, findings, options?.cost));

  return lines.join("\n");
};

export interface PersonaReportOptions {
  readonly mergedCount?: number;
}

export const formatPersonaReport = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  options: PersonaReportOptions & {
    dismissals?: ReadonlyMap<string, Dismissal>;
    cost?: number | null;
  } = {},
): string => {
  const personaSlugs = session.personas ?? [];
  const header = `Review: ${session.ref}`;
  const personaLine = `Personas: ${personaSlugs.join(", ")}`;
  const divider = "═".repeat(50);
  const lines: string[] = [header, personaLine];

  if (session.themes && session.themes.length > 0) {
    lines.push(`Themes: ${session.themes.join(", ")}`);
  }

  lines.push(divider, "");

  // Group findings by persona, maintaining persona order from session
  for (const slug of personaSlugs) {
    const personaFindings = findings.filter((f) => f.persona === slug);
    const label = capitalize(slug);
    const underline = "─".repeat(label.length + 2);

    lines.push(`  ${label}`);
    lines.push(`  ${underline}`);

    if (personaFindings.length === 0) {
      lines.push("  No findings.");
    } else {
      for (const finding of sortedFindings(personaFindings)) {
        lines.push(formatFinding(finding, options.dismissals?.get(finding.id)));
      }
    }
    lines.push("");
  }

  const separator = "─".repeat(50);
  lines.push(separator);
  lines.push(buildSummaryLine(session, findings, options.cost));

  if (options.mergedCount && options.mergedCount > 0) {
    lines.push(`  [${options.mergedCount} duplicates merged across personas]`);
  }

  return lines.join("\n");
};

export const formatSessionList = (
  sessions: readonly ReviewSession[],
): string => {
  if (sessions.length === 0) return "No review sessions found.";

  return sessions
    .map((s) => {
      const date = s.timestamp.slice(0, 10);
      const count = `${s.findingCount} finding${s.findingCount === 1 ? "" : "s"}`;
      return `[${date}] ${s.id.slice(0, 8)}  ${s.ref}  (${count})`;
    })
    .join("\n");
};

export const filterBySeverity = (
  findings: readonly ReviewFinding[],
  minSeverity: Severity,
): readonly ReviewFinding[] => {
  const threshold = SEVERITY_ORDER[minSeverity];
  return findings.filter((f) => SEVERITY_ORDER[f.severity] <= threshold);
};
