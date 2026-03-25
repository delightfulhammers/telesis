import type {
  OrchestratorContext,
  OrchestratorState,
  SessionExitReason,
  Decision,
} from "./types.js";
import type { Plan } from "../plan/types.js";
import type { WorkspaceState } from "../git/operations.js";

export type { WorkspaceState } from "../git/operations.js";

/** Structured resume briefing for incoming sessions */
export interface ResumeBriefing {
  readonly state: OrchestratorState;
  readonly milestoneId?: string;
  readonly milestoneName?: string;
  readonly lastSessionId?: string;
  readonly lastSessionExitReason?: SessionExitReason;
  readonly lastSessionEndedAt?: string;
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly currentTaskIndex: number;
  readonly currentTaskTitle?: string;
  readonly hasUncommittedChanges: boolean;
  readonly hasStagedChanges: boolean;
  readonly lastCommitSummary?: string;
  readonly pendingDecisions: readonly { kind: string; summary: string }[];
  readonly recommendation: string;
}

/** Dependencies for resume briefing generation */
export interface ResumeBriefingDeps {
  readonly loadContext: () => OrchestratorContext | null;
  readonly loadPlan: (planId: string) => Plan | null;
  readonly listPendingDecisions: () => readonly Decision[];
  readonly inspectWorkspace: () => WorkspaceState;
}

/** Generate a recovery recommendation from exit reason + workspace state */
export const generateRecommendation = (
  ctx: OrchestratorContext | null,
  workspace: WorkspaceState,
): string => {
  if (!ctx || ctx.state === "idle") {
    return "Orchestrator is idle. No active milestone.";
  }

  const reason = ctx.sessionExitReason;

  // No previous session — first run or session fields not yet set
  if (!ctx.sessionId) {
    return "No previous session recorded. Continue from current orchestrator state.";
  }

  // Session is still active (no endedAt)
  if (!ctx.sessionEndedAt) {
    return "Previous session did not report completion. It may have crashed. Assess workspace state before proceeding.";
  }

  if (reason === "hook_block" && workspace.hasStagedChanges) {
    return "Previous session completed work but was blocked by preflight. Run review convergence, then commit.";
  }

  if (reason === "hook_block" && workspace.hasUncommittedChanges) {
    return "Previous session was blocked by preflight. Unstaged changes exist — stage and run review convergence.";
  }

  if (reason === "hook_block") {
    return "Previous session was blocked by preflight but changes were not preserved. Check git stash or reflog.";
  }

  if (reason === "context_full" && workspace.hasUncommittedChanges) {
    return "Previous session ran out of context. Uncommitted changes may be partial. Assess completeness before proceeding.";
  }

  if (reason === "context_full") {
    return "Previous session ran out of context. No uncommitted changes. Continue from last checkpointed task.";
  }

  if (reason === "error" && workspace.hasUncommittedChanges) {
    return "Previous session errored. Uncommitted changes may be incomplete. Review changes carefully.";
  }

  if (reason === "error") {
    return "Previous session errored with no uncommitted changes. Investigate the error, then retry.";
  }

  if (reason === "clean") {
    return "Previous session ended normally. Continue from current orchestrator state.";
  }

  // reason is undefined — session ended but no exit reason was recorded
  if (reason === undefined) {
    if (workspace.hasUncommittedChanges) {
      return "Previous session ended without recording an exit reason. Uncommitted changes exist — assess before proceeding.";
    }
    return "Previous session ended without recording an exit reason. Continue from current state.";
  }

  // reason === "unknown" — explicitly unknown exit
  if (workspace.hasUncommittedChanges) {
    return "Previous session ended with unknown reason. Uncommitted changes exist — assess before proceeding.";
  }

  return "Previous session ended with unknown reason. No uncommitted changes. Continue from current state.";
};

/** Generate a resume briefing from current state */
export const generateResumeBriefing = (
  deps: ResumeBriefingDeps,
): ResumeBriefing => {
  const ctx = deps.loadContext();
  const workspace = deps.inspectWorkspace();
  const pendingDecisions = ctx ? deps.listPendingDecisions() : [];

  // Load plan for task progress
  let completedTasks = 0;
  let totalTasks = 0;
  let currentTaskTitle: string | undefined;

  let planLoaded = false;
  if (ctx?.planId) {
    const plan = deps.loadPlan(ctx.planId);
    if (plan) {
      planLoaded = true;
      totalTasks = plan.tasks.length;
      completedTasks = plan.tasks.filter(
        (t) => t.status === "completed",
      ).length;
      const currentIndex = ctx.currentTaskIndex ?? completedTasks;
      const currentTask = plan.tasks[currentIndex];
      currentTaskTitle = currentTask?.title;
    }
    // Plan load failed: cap task index at 0 to avoid out-of-range index
    // with totalTasks: 0. Title cannot be resolved without a plan.
  }

  const recommendation = generateRecommendation(ctx, workspace);

  return {
    state: ctx?.state ?? "idle",
    milestoneId: ctx?.milestoneId,
    milestoneName: ctx?.milestoneName,
    lastSessionId: ctx?.sessionId,
    lastSessionExitReason: ctx?.sessionExitReason,
    lastSessionEndedAt: ctx?.sessionEndedAt,
    completedTasks,
    totalTasks,
    currentTaskIndex: planLoaded
      ? (ctx?.currentTaskIndex ?? completedTasks)
      : 0,
    currentTaskTitle,
    hasUncommittedChanges: workspace.hasUncommittedChanges,
    hasStagedChanges: workspace.hasStagedChanges,
    lastCommitSummary: workspace.lastCommitSummary,
    pendingDecisions: pendingDecisions.map((d) => ({
      kind: d.kind,
      summary: d.summary,
    })),
    recommendation,
  };
};

/** Format a resume briefing as human-readable text */
export const formatResumeBriefing = (briefing: ResumeBriefing): string => {
  const lines: string[] = [];

  lines.push("Resume Briefing");
  lines.push("───────────────");
  lines.push(`State:          ${briefing.state}`);

  if (briefing.milestoneId || briefing.milestoneName) {
    const label = briefing.milestoneName
      ? `${briefing.milestoneId ?? ""} — ${briefing.milestoneName}`
      : briefing.milestoneId!;
    lines.push(`Milestone:      ${label}`);
  }

  if (briefing.lastSessionId) {
    const endInfo = briefing.lastSessionEndedAt
      ? ` (ended ${briefing.lastSessionEndedAt}, reason: ${briefing.lastSessionExitReason ?? "unknown"})`
      : " (may still be active or crashed)";
    lines.push(
      `Last session:   ${briefing.lastSessionId.slice(0, 8)}${endInfo}`,
    );
  }

  if (briefing.totalTasks > 0) {
    lines.push("");
    lines.push(
      `Task Progress:  ${briefing.completedTasks}/${briefing.totalTasks} complete`,
    );
    if (briefing.currentTaskTitle) {
      lines.push(`Current task:   ${briefing.currentTaskTitle}`);
    }
  }

  lines.push("");
  lines.push("Workspace:");
  lines.push(
    `  Uncommitted changes: ${briefing.hasUncommittedChanges ? "yes" : "none"}`,
  );
  lines.push(
    `  Staged changes:      ${briefing.hasStagedChanges ? "yes" : "none"}`,
  );
  if (briefing.lastCommitSummary) {
    lines.push(`  Last commit:         ${briefing.lastCommitSummary}`);
  }

  if (briefing.pendingDecisions.length > 0) {
    lines.push("");
    lines.push("Pending decisions:");
    for (const d of briefing.pendingDecisions) {
      lines.push(`  [${d.kind}] ${d.summary}`);
    }
  }

  lines.push("");
  lines.push("Recommendation:");
  lines.push(`  ${briefing.recommendation}`);

  return lines.join("\n");
};
