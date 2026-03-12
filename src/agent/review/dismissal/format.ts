import type { Dismissal } from "./types.js";
import type { DismissalStats, CandidateNoisePattern } from "./stats.js";

export const formatDismissalList = (
  dismissals: readonly Dismissal[],
): string => {
  if (dismissals.length === 0) return "No dismissals found.";

  return dismissals
    .map((d) => {
      const date = d.timestamp.slice(0, 10);
      const persona = d.persona ? ` (${d.persona})` : "";
      return `[${date}] ${d.id.slice(0, 8)}  ${d.path} [${d.severity}/${d.category}]${persona}  ${d.reason}`;
    })
    .join("\n");
};

export const formatDismissalStats = (
  stats: DismissalStats,
  patterns: readonly CandidateNoisePattern[],
): string => {
  if (stats.total === 0) return "No dismissals to analyze.";

  const lines: string[] = [];

  lines.push(`Dismissal Statistics (${stats.total} total)`);
  lines.push("═".repeat(50));
  lines.push("");

  // By reason
  lines.push("By Reason:");
  for (const [reason, count] of Object.entries(stats.byReason)) {
    if (count > 0) lines.push(`  ${reason}: ${count}`);
  }
  lines.push("");

  // By category
  lines.push("By Category:");
  for (const [category, count] of Object.entries(stats.byCategory)) {
    if (count > 0) lines.push(`  ${category}: ${count}`);
  }
  lines.push("");

  // By severity
  lines.push("By Severity:");
  for (const [severity, count] of Object.entries(stats.bySeverity)) {
    if (count > 0) lines.push(`  ${severity}: ${count}`);
  }

  // By persona (if any)
  if (Object.keys(stats.byPersona).length > 0) {
    lines.push("");
    lines.push("By Persona:");
    for (const [persona, count] of Object.entries(stats.byPersona)) {
      if (count > 0) lines.push(`  ${persona}: ${count}`);
    }
  }

  // Noise patterns
  if (patterns.length > 0) {
    lines.push("");
    lines.push("─".repeat(50));
    lines.push("Candidate Noise Patterns:");
    for (const p of patterns) {
      lines.push(`  "${p.substring}" (${p.count} occurrences, ${p.reason})`);
    }
  }

  return lines.join("\n");
};
