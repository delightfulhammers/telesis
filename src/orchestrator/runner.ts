import { transition } from "./machine.js";
import type {
  OrchestratorContext,
  OrchestratorState,
  Decision,
  DecisionKind,
} from "./types.js";

/** Result of an advance call */
export interface AdvanceResult {
  readonly context: OrchestratorContext;
  /** True when the orchestrator is waiting for a human decision */
  readonly waiting: boolean;
  readonly error?: string;
}

/** Work item summary with content for LLM calls */
export interface WorkItemSummary {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** Injected dependencies — keeps the runner pure and testable */
export interface RunnerDeps {
  readonly syncIntake: () => Promise<{
    imported: number;
    workItemIds: string[];
  }>;
  readonly loadWorkItems: (
    ids: readonly string[],
  ) => readonly WorkItemSummary[];
  readonly suggestGrouping: (workItems: readonly WorkItemSummary[]) => Promise<{
    milestones: readonly {
      name: string;
      goal: string;
      workItemIds: readonly string[];
    }[];
  }>;
  readonly assessTdd: (input: {
    milestoneName: string;
    milestoneGoal: string;
    workItemTitles: readonly string[];
  }) => Promise<{ needsTdd: boolean; rationale: string }>;
  readonly createMilestoneEntry: (
    milestoneId: string,
    milestoneName: string,
  ) => void;
  readonly createPlan: (workItemId: string) => Promise<string>;
  readonly approvePlan: (planId: string) => void;
  readonly executeTasks: (planId: string) => Promise<{
    allComplete: boolean;
    error?: string;
  }>;
  readonly runQualityGates: () => Promise<{
    passed: boolean;
    error?: string;
  }>;
  readonly runReviewConvergence: () => Promise<{
    converged: boolean;
    rounds: number;
    finalFindings: readonly unknown[];
  }>;
  readonly runMilestoneCheck: () => Promise<{
    passed: boolean;
    error?: string;
  }>;
  readonly runMilestoneComplete: () => void;
  readonly listPendingDecisions: () => readonly Decision[];
  readonly createDecision: (input: {
    kind: DecisionKind;
    summary: string;
    detail: string;
  }) => Decision;
  readonly notify: (title: string, message: string) => void;
  readonly saveContext: (ctx: OrchestratorContext) => void;
  readonly emitEvent: (payload: {
    fromState: OrchestratorState;
    toState: OrchestratorState;
    milestoneId?: string;
  }) => void;
}

/** Check if there's a pending decision of a specific kind */
const hasPendingDecision = (deps: RunnerDeps, kind: DecisionKind): boolean =>
  deps.listPendingDecisions().some((d) => d.kind === kind);

/** Transition helper that persists and emits */
const doTransition = (
  ctx: OrchestratorContext,
  to: OrchestratorState,
  deps: RunnerDeps,
  updates?: Partial<OrchestratorContext>,
): AdvanceResult => {
  const result = transition(ctx, to, {
    ...updates,
    pendingDecisionKind: undefined,
    completionRan: undefined,
  });
  if (!result.ok) {
    return { context: ctx, waiting: false, error: result.error };
  }

  deps.saveContext(result.context);
  deps.emitEvent({
    fromState: ctx.state,
    toState: to,
    milestoneId: result.context.milestoneId,
  });

  return { context: result.context, waiting: false };
};

/** Wait result — orchestrator pauses until a decision is resolved */
const waitForDecision = (ctx: OrchestratorContext): AdvanceResult => ({
  context: ctx,
  waiting: true,
});

/**
 * Creates a decision, marks the kind in context, persists, and waits.
 * The next advance call will see `pendingDecisionKind` set and
 * `hasPendingDecision` returning true, so it will wait.
 * When the decision is resolved (removed from pending), advance
 * will see no pending decision AND `pendingDecisionKind` set,
 * indicating the decision was approved — it can advance.
 */
const createAndWait = (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
  kind: DecisionKind,
  summary: string,
  detail: string,
  notifyTitle?: string,
  extraUpdates?: Partial<OrchestratorContext>,
): AdvanceResult => {
  const decision = deps.createDecision({ kind, summary, detail });

  const updated: OrchestratorContext = {
    ...ctx,
    ...extraUpdates,
    pendingDecisionKind: kind,
    updatedAt: new Date().toISOString(),
  };
  deps.saveContext(updated);

  if (notifyTitle) {
    const shortId = decision.id.slice(0, 8);
    deps.notify(
      notifyTitle,
      `${summary} — approve: telesis orchestrator approve ${shortId}`,
    );
  }

  return waitForDecision(updated);
};

/**
 * Check if a decision of the given kind was created and has since been resolved.
 * Returns true when: pendingDecisionKind matches AND no pending decision of that kind.
 */
const decisionWasApproved = (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
  kind: DecisionKind,
): boolean =>
  ctx.pendingDecisionKind === kind && !hasPendingDecision(deps, kind);

/**
 * Attempts to advance the orchestrator one step forward.
 */
export const advance = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  switch (ctx.state) {
    case "idle":
      return advanceIdle(ctx, deps);
    case "intake":
      return advanceIntake(ctx, deps);
    case "triage":
      return advanceTriage(ctx, deps);
    case "milestone_setup":
      return advanceMilestoneSetup(ctx, deps);
    case "planning":
      return advancePlanning(ctx, deps);
    case "executing":
      return advanceExecuting(ctx, deps);
    case "post_task":
      return advancePostTask(ctx, deps);
    case "reviewing":
      return advanceReviewing(ctx, deps);
    case "milestone_check":
      return advanceMilestoneCheck(ctx, deps);
    case "milestone_complete":
      return advanceMilestoneComplete(ctx, deps);
    default:
      return {
        context: ctx,
        waiting: false,
        error: `Unknown state: ${ctx.state}`,
      };
  }
};

const advanceIdle = (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): AdvanceResult => doTransition(ctx, "intake", deps);

const advanceIntake = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  const result = await deps.syncIntake();
  const ids = result.workItemIds ?? [];

  if (ids.length === 0) {
    return doTransition(ctx, "idle", deps);
  }

  // workItemIds must be in ctx before triage precondition check.
  // transition() checks preconditions against pre-update ctx, so we
  // need to materialize the items first via a context-only save,
  // then transition. This is atomic enough — if we crash between
  // the save and the transition, recovery reloads intake state with items.
  const withItems: OrchestratorContext = {
    ...ctx,
    workItemIds: ids,
    updatedAt: new Date().toISOString(),
  };
  deps.saveContext(withItems);

  return doTransition(withItems, "triage", deps);
};

const advanceTriage = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "triage_approval")) {
    return waitForDecision(ctx);
  }

  if (decisionWasApproved(ctx, deps, "triage_approval")) {
    return doTransition(ctx, "milestone_setup", deps);
  }

  // No decision yet — suggest grouping and create decision
  const workItems = deps.loadWorkItems(ctx.workItemIds);
  const groupingResult = await deps.suggestGrouping(workItems);

  return createAndWait(
    ctx,
    deps,
    "triage_approval",
    "Approve milestone scope and grouping",
    JSON.stringify({
      workItemIds: [...ctx.workItemIds],
      workItems: workItems.map((wi) => ({
        id: wi.id,
        title: wi.title,
      })),
      suggestedGroupings: groupingResult?.milestones ?? [],
    }),
    "Decision needed",
  );
};

const advanceMilestoneSetup = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "milestone_approval")) {
    return waitForDecision(ctx);
  }

  if (decisionWasApproved(ctx, deps, "milestone_approval")) {
    return doTransition(ctx, "planning", deps);
  }

  // Assess TDD necessity
  const workItems = deps.loadWorkItems(ctx.workItemIds);
  const assessment = await deps.assessTdd({
    milestoneName: ctx.milestoneName ?? "",
    milestoneGoal: ctx.milestoneGoal ?? "",
    workItemTitles: workItems.map((w) => w.title),
  });

  return createAndWait(
    ctx,
    deps,
    "milestone_approval",
    `Approve milestone "${ctx.milestoneName}" definition${assessment.needsTdd ? " (TDD recommended)" : ""}`,
    JSON.stringify({
      milestoneId: ctx.milestoneId,
      needsTdd: assessment.needsTdd,
      rationale: assessment.rationale,
    }),
    "Decision needed",
  );
};

const advancePlanning = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "plan_approval")) {
    return waitForDecision(ctx);
  }

  if (decisionWasApproved(ctx, deps, "plan_approval")) {
    if (ctx.planId) {
      deps.approvePlan(ctx.planId);
    }
    return doTransition(ctx, "executing", deps);
  }

  // Create plan and decision atomically (single saveContext call via createAndWait)
  // v0.23.0: plan the first work item only; multi-item planning is future work
  const planId = await deps.createPlan(ctx.workItemIds[0]);

  return createAndWait(
    ctx,
    deps,
    "plan_approval",
    `Approve task plan for ${ctx.milestoneName ?? ctx.milestoneId ?? "milestone"}`,
    JSON.stringify({ planId }),
    "Decision needed",
    { planId },
  );
};

const advanceExecuting = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "escalation")) {
    return waitForDecision(ctx);
  }

  if (!ctx.planId) {
    return {
      context: ctx,
      waiting: false,
      error: "Cannot execute tasks: planId is not set",
    };
  }

  const result = await deps.executeTasks(ctx.planId);

  if (result.allComplete) {
    return doTransition(ctx, "post_task", deps);
  }

  return createAndWait(
    ctx,
    deps,
    "escalation",
    `Task failed: ${result.error ?? "unknown error"}`,
    JSON.stringify({ planId: ctx.planId, error: result.error }),
    "Task escalated",
  );
};

const advancePostTask = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  const result = await deps.runQualityGates();

  if (result.passed) {
    return doTransition(ctx, "reviewing", deps);
  }

  return doTransition(ctx, "executing", deps);
};

const advanceReviewing = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "convergence_failure")) {
    return waitForDecision(ctx);
  }

  const result = await deps.runReviewConvergence();

  if (result.converged) {
    return doTransition(ctx, "milestone_check", deps, {
      reviewRound: result.rounds,
      reviewFindings: result.finalFindings.length,
    });
  }

  return createAndWait(
    ctx,
    deps,
    "convergence_failure",
    `Review didn't converge after ${result.rounds} rounds (${result.finalFindings.length} findings remaining)`,
    JSON.stringify({
      rounds: result.rounds,
      remainingFindings: result.finalFindings.length,
    }),
    "Review escalated",
  );
};

const advanceMilestoneCheck = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "criteria_confirmation")) {
    return waitForDecision(ctx);
  }

  if (decisionWasApproved(ctx, deps, "criteria_confirmation")) {
    return doTransition(ctx, "milestone_complete", deps);
  }

  const result = await deps.runMilestoneCheck();

  if (!result.passed) {
    return doTransition(ctx, "reviewing", deps);
  }

  return createAndWait(
    ctx,
    deps,
    "criteria_confirmation",
    `Confirm acceptance criteria met for ${ctx.milestoneName ?? ctx.milestoneId}`,
    JSON.stringify({ milestoneId: ctx.milestoneId }),
    "Milestone ready",
  );
};

const advanceMilestoneComplete = async (
  ctx: OrchestratorContext,
  deps: RunnerDeps,
): Promise<AdvanceResult> => {
  if (hasPendingDecision(deps, "ship_confirmation")) {
    return waitForDecision(ctx);
  }

  if (decisionWasApproved(ctx, deps, "ship_confirmation")) {
    return doTransition(ctx, "idle", deps);
  }

  // Only run completion once — guard with completionRan flag
  if (!ctx.completionRan) {
    deps.runMilestoneComplete();

    return createAndWait(
      ctx,
      deps,
      "ship_confirmation",
      `Ship ${ctx.milestoneName ?? ctx.milestoneId}? (commit, tag, push)`,
      JSON.stringify({ milestoneId: ctx.milestoneId }),
      "Ready to ship",
      { completionRan: true },
    );
  }

  // completionRan but decision state is inconsistent
  return {
    context: ctx,
    waiting: false,
    error:
      "Milestone completion ran but ship_confirmation decision state is inconsistent",
  };
};
