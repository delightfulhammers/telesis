/** All orchestrator lifecycle states */
export const ORCHESTRATOR_STATES = [
  "idle",
  "intake",
  "triage",
  "milestone_setup",
  "planning",
  "executing",
  "post_task",
  "reviewing",
  "milestone_check",
  "milestone_complete",
] as const;

export type OrchestratorState = (typeof ORCHESTRATOR_STATES)[number];

/** Persistent orchestrator context — everything needed to resume after crash */
export interface OrchestratorContext {
  readonly state: OrchestratorState;
  readonly milestoneId?: string;
  readonly milestoneName?: string;
  readonly workItemIds: readonly string[];
  readonly planId?: string;
  readonly currentTaskIndex?: number;
  readonly reviewRound?: number;
  readonly reviewFindings?: number;
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly error?: string;
}

/** Decision kinds — one per human gate in the lifecycle */
export type DecisionKind =
  | "triage_approval"
  | "milestone_approval"
  | "plan_approval"
  | "escalation"
  | "convergence_failure"
  | "criteria_confirmation"
  | "ship_confirmation";

/** A queued decision awaiting human response */
export interface Decision {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly createdAt: string;
  readonly summary: string;
  readonly detail: string;
  readonly resolvedAt?: string;
  readonly resolution?: "approved" | "rejected";
  readonly reason?: string;
}

/** Result of a preflight check */
export interface PreflightResult {
  readonly passed: boolean;
  readonly checks: readonly PreflightCheck[];
}

export interface PreflightCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
}

/** Valid state transitions — the orchestrator enforces these */
export const VALID_TRANSITIONS: ReadonlyMap<
  OrchestratorState,
  readonly OrchestratorState[]
> = new Map([
  ["idle", ["intake"]],
  ["intake", ["triage", "idle"]],
  ["triage", ["milestone_setup", "idle"]],
  ["milestone_setup", ["planning", "triage"]],
  ["planning", ["executing", "milestone_setup"]],
  ["executing", ["post_task", "planning"]],
  ["post_task", ["reviewing", "executing"]],
  ["reviewing", ["milestone_check", "executing"]],
  ["milestone_check", ["milestone_complete", "reviewing"]],
  ["milestone_complete", ["idle"]],
]);
