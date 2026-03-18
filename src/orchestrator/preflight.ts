import type { PreflightResult, PreflightCheck } from "./types.js";
import { loadContext } from "./persistence.js";
import { listPendingDecisions } from "./decisions.js";
import { checkMilestone } from "../milestones/check.js";
import { parseActiveMilestone } from "../milestones/parse.js";

/**
 * Runs preflight checks to determine whether a commit/push is safe.
 * Used by Claude Code hooks to gate git operations.
 *
 * When the orchestrator is idle or absent, only checks for blocking
 * decisions — housekeeping commits are not blocked by the absence
 * of an active milestone.
 *
 * When the orchestrator is actively running, enforces milestone entry,
 * review convergence, and quality gates.
 */
export const runPreflight = (rootDir: string): PreflightResult => {
  const checks: PreflightCheck[] = [];
  const ctx = loadContext(rootDir);
  const orchestratorActive = ctx !== null && ctx.state !== "idle";

  // Only enforce milestone and review checks when orchestrator is active
  if (orchestratorActive) {
    // Check: Milestone entry exists
    const milestone = parseActiveMilestone(rootDir);
    checks.push({
      name: "Milestone entry",
      passed: milestone !== undefined,
      message: milestone
        ? `Active: ${milestone.name}`
        : "No active milestone in MILESTONES.md",
    });

    // Check: Review convergence
    const pastReview =
      ctx.state === "milestone_check" || ctx.state === "milestone_complete";
    checks.push({
      name: "Review convergence",
      passed: pastReview,
      message: pastReview
        ? "Review has converged"
        : `Orchestrator in state "${ctx.state}" — review not yet converged`,
    });

    // Check: Quality gates
    try {
      const report = checkMilestone(rootDir);
      const autoChecks = report.results.filter((r) => r.kind === "auto");
      const allAutoPass = autoChecks.every((r) => r.passed);
      checks.push({
        name: "Quality gates",
        passed: allAutoPass,
        message: allAutoPass
          ? "All automated checks pass"
          : `${autoChecks.filter((r) => !r.passed).length} automated check(s) failing`,
      });
    } catch {
      checks.push({
        name: "Quality gates",
        passed: false,
        message: "Could not run milestone check",
      });
    }
  }

  // Always check: No blocking pending decisions
  const pending = listPendingDecisions(rootDir);
  const blocking = pending.filter(
    (d) =>
      d.kind === "escalation" ||
      d.kind === "convergence_failure" ||
      d.kind === "criteria_confirmation" ||
      d.kind === "ship_confirmation",
  );
  checks.push({
    name: "Pending decisions",
    passed: blocking.length === 0,
    message:
      blocking.length === 0
        ? "No blocking decisions"
        : `${blocking.length} blocking decision(s) awaiting response`,
  });

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
};
