import {
  VALID_TRANSITIONS,
  type OrchestratorContext,
  type OrchestratorState,
} from "./types.js";

export interface TransitionResult {
  readonly ok: boolean;
  readonly context: OrchestratorContext;
  readonly error?: string;
}

/** Creates a fresh orchestrator context in idle state. */
export const createContext = (): OrchestratorContext => ({
  state: "idle",
  workItemIds: [],
  updatedAt: new Date().toISOString(),
});

/** Checks whether a transition from one state to another is structurally valid. */
export const canTransition = (
  from: OrchestratorState,
  to: OrchestratorState,
): boolean => {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.includes(to);
};

/**
 * Precondition checks for specific state entries.
 * Returns an error message if the precondition fails, undefined if OK.
 */
const checkPreconditions = (
  ctx: OrchestratorContext,
  to: OrchestratorState,
): string | undefined => {
  switch (to) {
    case "triage":
      if (ctx.workItemIds.length === 0) {
        return "Cannot enter triage: no work items. Run intake first.";
      }
      return undefined;

    case "planning":
      if (!ctx.milestoneId) {
        return "Cannot enter planning: no milestone set. Complete milestone setup first.";
      }
      return undefined;

    case "executing":
      if (!ctx.planId) {
        return "Cannot enter executing: no plan set. Complete planning first.";
      }
      return undefined;

    default:
      return undefined;
  }
};

/**
 * Computes context mutations that happen automatically on state entry.
 * These are not optional — they're part of the state machine's semantics.
 *
 * Entry effects take precedence over caller-supplied updates for fields
 * they define — this is intentional. The state machine owns these fields.
 */
const entryEffects = (
  from: OrchestratorState,
  to: OrchestratorState,
): Partial<OrchestratorContext> => {
  switch (to) {
    case "idle":
      return {
        milestoneId: undefined,
        milestoneName: undefined,
        workItemIds: [],
        planId: undefined,
        currentTaskIndex: undefined,
        reviewRound: undefined,
        reviewFindings: undefined,
        startedAt: undefined,
        error: undefined,
      };

    case "reviewing":
      // Only reset review round on first entry (from post_task).
      // Re-entry from executing (retry path) preserves the round count.
      if (from === "post_task") {
        return {
          reviewRound: 1,
          reviewFindings: undefined,
        };
      }
      return {};

    default:
      return {};
  }
};

/**
 * Attempts a state transition. Returns the new context on success,
 * or the unchanged context with an error on failure.
 *
 * Transitions are validated against VALID_TRANSITIONS and preconditions.
 * Entry effects and caller-supplied updates are applied atomically.
 */
export const transition = (
  ctx: OrchestratorContext,
  to: OrchestratorState,
  updates?: Partial<OrchestratorContext>,
): TransitionResult => {
  // Structural validity uses the original state — updates cannot change it
  if (!canTransition(ctx.state, to)) {
    return {
      ok: false,
      context: ctx,
      error: `Invalid transition: ${ctx.state} → ${to}`,
    };
  }

  // Preconditions check the pre-update context — required state must have been
  // established in a prior step, not injected via the transition's updates.
  const preconditionError = checkPreconditions(ctx, to);
  if (preconditionError) {
    return { ok: false, context: ctx, error: preconditionError };
  }

  // Apply caller updates, then entry effects. Entry effects take precedence
  // for fields they define — the state machine owns those fields.
  // This is intentional: idle resets workItemIds to [], reviewing resets
  // reviewRound to 1 (from post_task). Callers cannot override these.
  const withUpdates = updates ? { ...ctx, ...updates } : ctx;
  const effects = entryEffects(ctx.state, to);

  const newContext: OrchestratorContext = {
    ...withUpdates,
    ...effects,
    state: to,
    error: undefined,
    updatedAt: new Date().toISOString(),
  };

  return { ok: true, context: newContext };
};
