import type {
  TelesisDaemonEvent,
  DispatchSessionFailedPayload,
} from "./types.js";
import type {
  OrchestratorContext,
  SessionExitReason,
} from "../orchestrator/types.js";
import type { AdvanceResult, RunnerDeps } from "../orchestrator/runner.js";
import type {
  RestartPolicy,
  SessionLifecycleConfig,
} from "../config/config.js";

/** Dependencies injected into the session reactor */
export interface SessionReactorDeps {
  readonly config: SessionLifecycleConfig;
  readonly loadContext: () => OrchestratorContext | null;
  readonly saveContext: (ctx: OrchestratorContext) => void;
  readonly advance: (
    ctx: OrchestratorContext,
    deps: RunnerDeps,
  ) => Promise<AdvanceResult>;
  readonly buildRunnerDeps: () => RunnerDeps;
  readonly notify: (title: string, body: string) => void;
}

/** Dispatch session lifecycle events — narrowed from TelesisDaemonEvent */
type DispatchLifecycleEvent = Extract<
  TelesisDaemonEvent,
  { readonly type: "dispatch:session:completed" | "dispatch:session:failed" }
>;

/** In-memory reactor state (not persisted) */
interface ReactorState {
  restartCount: number;
  lastRestartAt?: number;
  milestoneId?: string;
  pendingCooldown: boolean;
  /** Milestone IDs that have tripped the circuit breaker — prevents reset on regression */
  exhaustedMilestones: Set<string>;
}

/** Map a dispatch lifecycle event to an orchestrator SessionExitReason */
export const mapExitReason = (
  event: DispatchLifecycleEvent,
): SessionExitReason => {
  if (event.type === "dispatch:session:completed") return "clean";

  const error = (
    (event.payload as DispatchSessionFailedPayload).error ?? ""
  ).toLowerCase();
  if (error.includes("hook") || error.includes("preflight"))
    return "hook_block";
  if (error.includes("context") || error.includes("token"))
    return "context_full";
  return "error";
};

/** Apply the configured restart policy after a session ends */
const applyPolicy = (
  policy: RestartPolicy,
  ctx: OrchestratorContext,
  deps: SessionReactorDeps,
  state: ReactorState,
): void => {
  const maxRestarts = deps.config.maxRestartsPerMilestone ?? 10;
  const cooldownMs = (deps.config.cooldownSeconds ?? 30) * 1000;

  if (policy === "manual") return;

  if (policy === "notify-only") {
    deps.notify(
      "Session ended",
      `Orchestrator in ${ctx.state}, exit: ${ctx.sessionExitReason ?? "unknown"}. Run 'telesis orchestrator run' to continue.`,
    );
    return;
  }

  // auto-restart
  if (state.restartCount >= maxRestarts) {
    if (ctx.milestoneId) state.exhaustedMilestones.add(ctx.milestoneId);
    deps.notify(
      "Circuit breaker tripped",
      `${state.restartCount} restarts for milestone ${ctx.milestoneId ?? "unknown"}. Manual intervention required.`,
    );
    return;
  }

  // Prevent double-scheduling: if a cooldown timer is already pending, skip
  if (state.pendingCooldown) return;

  const now = Date.now();
  if (state.lastRestartAt && now - state.lastRestartAt < cooldownMs) {
    const remainingMs = cooldownMs - (now - state.lastRestartAt);
    state.pendingCooldown = true;
    deps.notify(
      "Cooldown active",
      `Waiting ${Math.ceil(remainingMs / 1000)}s before next auto-restart.`,
    );
    setTimeout(async () => {
      try {
        const freshCtx = deps.loadContext();
        // Re-read config at fire time — don't rely on closure-captured maxRestarts
        const currentMax = deps.config.maxRestartsPerMilestone ?? 10;
        if (state.restartCount >= currentMax) {
          if (freshCtx?.milestoneId)
            state.exhaustedMilestones.add(freshCtx.milestoneId);
          deps.notify(
            "Circuit breaker tripped",
            `${state.restartCount} restarts for milestone ${freshCtx?.milestoneId ?? "unknown"}. Manual intervention required.`,
          );
          return;
        }
        if (
          freshCtx?.milestoneId &&
          state.exhaustedMilestones.has(freshCtx.milestoneId)
        ) {
          return;
        }
        state.restartCount++;
        state.lastRestartAt = Date.now();
        if (freshCtx && freshCtx.state !== "idle") {
          await deps.advance(freshCtx, deps.buildRunnerDeps());
        }
      } catch {
        // advance failure is handled by the orchestrator error state
      } finally {
        // Reset pendingCooldown only after all work is done (or errored)
        state.pendingCooldown = false;
      }
    }, remainingMs);
    return;
  }

  state.restartCount++;
  state.lastRestartAt = now;
  deps.advance(ctx, deps.buildRunnerDeps()).catch(() => {
    // advance failure is handled by the orchestrator error state
  });
};

/**
 * Create a session reactor — an event handler that reacts to dispatch
 * session lifecycle events and drives the orchestrator forward.
 *
 * The reactor is a trigger, not a controller. It updates session state
 * and calls advance(), but the orchestrator state machine decides what
 * happens next.
 */
export const createSessionReactor = (
  deps: SessionReactorDeps,
): ((event: TelesisDaemonEvent) => void) => {
  const state: ReactorState = {
    restartCount: 0,
    pendingCooldown: false,
    exhaustedMilestones: new Set(),
  };

  return (event: TelesisDaemonEvent) => {
    if (
      event.type !== "dispatch:session:completed" &&
      event.type !== "dispatch:session:failed"
    ) {
      return;
    }

    const ctx = deps.loadContext();
    if (!ctx || ctx.state === "idle") return;

    // Step 1: Map exit reason
    const exitReason = mapExitReason(event);

    // Step 2: Update orchestrator context with session end state
    const updatedCtx: OrchestratorContext = {
      ...ctx,
      sessionEndedAt: new Date().toISOString(),
      sessionExitReason: exitReason,
      updatedAt: new Date().toISOString(),
    };
    deps.saveContext(updatedCtx);

    // Step 3: Detect milestone transition (reset circuit breaker — but not for exhausted milestones)
    if (ctx.milestoneId !== state.milestoneId) {
      const isFirstEvent = state.milestoneId === undefined;
      state.milestoneId = ctx.milestoneId;
      // Only reset on actual transition, not on first-event initialization
      if (
        !isFirstEvent &&
        ctx.milestoneId &&
        !state.exhaustedMilestones.has(ctx.milestoneId)
      ) {
        state.restartCount = 0;
      }
    }

    // Step 4: Apply restart policy
    const policy = deps.config.restartPolicy ?? "notify-only";
    applyPolicy(policy, updatedCtx, deps, state);
  };
};
