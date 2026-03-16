import type { Decision } from "./types.js";

/**
 * Formats a decision's detail field for human-readable display.
 * Returns null when there's no meaningful detail to show.
 */
export const formatDecisionDetail = (decision: Decision): string | null => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(decision.detail);
  } catch {
    return decision.detail || null;
  }

  switch (decision.kind) {
    case "triage_approval":
      return formatTriageDetail(parsed);
    case "milestone_approval":
      return formatMilestoneDetail(parsed);
    case "plan_approval":
      return formatPlanDetail(parsed);
    case "escalation":
      return formatEscalationDetail(parsed);
    case "convergence_failure":
      return formatConvergenceDetail(parsed);
    case "criteria_confirmation":
    case "ship_confirmation":
      return formatMilestoneRefDetail(parsed);
    default:
      return JSON.stringify(parsed, null, 2);
  }
};

const safeStr = (val: unknown): string =>
  typeof val === "string" ? val : String(val ?? "");

const formatTriageDetail = (parsed: Record<string, unknown>): string | null => {
  const lines: string[] = [];

  const workItems = Array.isArray(parsed.workItems) ? parsed.workItems : [];
  if (workItems.length > 0) {
    lines.push("  Work items:");
    for (const wi of workItems) {
      if (wi && typeof wi === "object") {
        const obj = wi as Record<string, unknown>;
        const title = safeStr(obj.title);
        const id = safeStr(obj.id).slice(0, 8);
        lines.push(`    - ${title} (${id})`);
      }
    }
  }

  const groupings = Array.isArray(parsed.suggestedGroupings)
    ? parsed.suggestedGroupings
    : [];
  if (groupings.length > 0) {
    lines.push("");
    lines.push("  Suggested groupings:");
    for (const g of groupings) {
      if (g && typeof g === "object") {
        const obj = g as Record<string, unknown>;
        lines.push(`    ${safeStr(obj.name)} — ${safeStr(obj.goal)}`);
        const ids = Array.isArray(obj.workItemIds) ? obj.workItemIds : [];
        lines.push(
          `      Items: ${ids.map((id: unknown) => safeStr(id).slice(0, 8)).join(", ")}`,
        );
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
};

const formatMilestoneDetail = (
  parsed: Record<string, unknown>,
): string | null => {
  const lines: string[] = [];
  if (parsed.milestoneId) {
    lines.push(`  Milestone: ${parsed.milestoneId}`);
  }
  if (parsed.needsTdd !== undefined) {
    lines.push(`  TDD needed: ${parsed.needsTdd ? "yes" : "no"}`);
  }
  if (parsed.rationale) {
    lines.push(`  Rationale: ${parsed.rationale}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
};

const formatPlanDetail = (parsed: Record<string, unknown>): string | null => {
  if (typeof parsed.planId === "string") {
    return `  Plan: ${parsed.planId.slice(0, 8)}`;
  }
  return null;
};

const formatEscalationDetail = (
  parsed: Record<string, unknown>,
): string | null => {
  const lines: string[] = [];
  if (typeof parsed.planId === "string") {
    lines.push(`  Plan: ${parsed.planId.slice(0, 8)}`);
  }
  if (parsed.error) {
    lines.push(`  Error: ${parsed.error}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
};

const formatConvergenceDetail = (
  parsed: Record<string, unknown>,
): string | null => {
  const lines: string[] = [];
  if (parsed.rounds) {
    lines.push(`  Rounds: ${parsed.rounds}`);
  }
  if (parsed.remainingFindings) {
    lines.push(`  Remaining findings: ${parsed.remainingFindings}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
};

const formatMilestoneRefDetail = (
  parsed: Record<string, unknown>,
): string | null => {
  if (parsed.milestoneId) {
    return `  Milestone: ${parsed.milestoneId}`;
  }
  return null;
};
