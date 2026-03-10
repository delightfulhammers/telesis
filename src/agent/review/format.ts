import type { ReviewSession, ReviewFinding, Severity } from "./types.js";

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

const formatFinding = (finding: ReviewFinding): string => {
  const icon = SEVERITY_ICON[finding.severity];
  const header = `  ${icon} [${finding.severity}] ${finding.category} — ${formatLocation(finding)}`;
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

export const formatReviewReport = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
): string => {
  const header = `Review: ${session.ref}`;
  const divider = "═".repeat(50);
  const lines: string[] = [header, divider, ""];

  if (findings.length === 0) {
    lines.push("  No findings.");
    lines.push("");
  } else {
    const sorted = [...findings].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
    for (const finding of sorted) {
      lines.push(formatFinding(finding));
      lines.push("");
    }
  }

  const separator = "─".repeat(50);
  const totalTokens =
    session.tokenUsage.inputTokens + session.tokenUsage.outputTokens;
  const summary =
    findings.length === 0
      ? `0 findings · ${formatTokens(totalTokens)} tokens · ${formatDuration(session.durationMs)}`
      : `${findings.length} findings (${countBySeverity(findings)}) · ${formatTokens(totalTokens)} tokens · ${formatDuration(session.durationMs)}`;

  lines.push(separator);
  lines.push(summary);

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
