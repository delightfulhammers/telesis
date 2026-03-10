import type { DocumentType } from "../agent/generate/types.js";
import type {
  EvalReport,
  DocumentScore,
  PerDocumentAxis,
  GlobalAxis,
} from "./types.js";

const PER_DOC_AXIS_LABELS: Readonly<Record<PerDocumentAxis, string>> = {
  completeness: "Completeness",
  specificity: "Specificity",
  actionability: "Actionability",
};

const GLOBAL_AXIS_LABELS: Readonly<Record<GlobalAxis, string>> = {
  coverage: "Coverage",
  consistency: "Consistency",
};

const DOC_DISPLAY_NAMES: Readonly<Record<DocumentType, string>> = {
  vision: "VISION.md",
  prd: "PRD.md",
  architecture: "ARCHITECTURE.md",
  milestones: "MILESTONES.md",
};

const scoreBar = (score: number, width: number = 20): string => {
  const filled = Math.round(score * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
};

const scoreColor = (score: number): string => {
  if (score >= 0.8) return "✓";
  if (score >= 0.5) return "~";
  return "✗";
};

const formatPercent = (score: number): string => `${Math.round(score * 100)}%`;

const formatDocumentScore = (ds: DocumentScore): string => {
  const lines: string[] = [];
  const docName = DOC_DISPLAY_NAMES[ds.document];

  lines.push(
    `  ${docName}  ${scoreBar(ds.overall)} ${formatPercent(ds.overall)}`,
  );

  for (const axis of Object.keys(PER_DOC_AXIS_LABELS) as PerDocumentAxis[]) {
    const axisScore = ds.axes[axis];
    const indicator = scoreColor(axisScore);
    const label = PER_DOC_AXIS_LABELS[axis].padEnd(15);
    lines.push(`    ${indicator} ${label} ${formatPercent(axisScore)}`);
  }

  return lines.join("\n");
};

/**
 * Formats an evaluation report as a human-readable string for terminal output.
 */
export const formatReport = (report: EvalReport): string => {
  const lines: string[] = [];

  lines.push("Document Quality Report");
  lines.push("═".repeat(50));
  lines.push("");

  // Overall score
  lines.push(
    `Overall: ${scoreBar(report.overall)} ${formatPercent(report.overall)}`,
  );
  lines.push("");

  // Per-document scores
  lines.push("Per Document:");
  lines.push("─".repeat(50));
  for (const ds of report.documents) {
    lines.push(formatDocumentScore(ds));
    lines.push("");
  }

  // Global axes
  lines.push("Cross-Document:");
  lines.push("─".repeat(50));
  for (const axis of Object.keys(GLOBAL_AXIS_LABELS) as GlobalAxis[]) {
    const axisScore = report.globalAxes[axis].score;
    const indicator = scoreColor(axisScore);
    const label = GLOBAL_AXIS_LABELS[axis].padEnd(15);
    lines.push(`  ${indicator} ${label} ${formatPercent(axisScore)}`);
  }
  lines.push("");

  // Diagnostics summary
  const warnings = report.diagnostics.filter((d) => d.severity === "warning");
  const errors = report.diagnostics.filter((d) => d.severity === "error");

  if (errors.length > 0 || warnings.length > 0) {
    lines.push("─".repeat(50));
    lines.push("Diagnostics:");

    for (const d of errors) {
      lines.push(`  ✗ [${d.document}] ${d.message}`);
    }
    for (const d of warnings) {
      lines.push(`  ~ [${d.document}] ${d.message}`);
    }
  }

  lines.push("");

  return lines.join("\n");
};
