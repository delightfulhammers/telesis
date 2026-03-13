/** Valid plan statuses — used for runtime validation */
export const PLAN_STATUSES = [
  "draft",
  "approved",
  "executing",
  "completed",
  "failed",
] as const;

/** Status lifecycle for a plan */
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Valid plan task statuses — used for runtime validation */
export const PLAN_TASK_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
] as const;

/** Status lifecycle for a task within a plan */
export type PlanTaskStatus = (typeof PLAN_TASK_STATUSES)[number];

/** A single step within a plan */
export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
  readonly status: PlanTaskStatus;
  readonly sessionId?: string;
  readonly completedAt?: string;
  readonly error?: string;
}

/** A decomposition of a work item into ordered tasks */
export interface Plan {
  readonly id: string;
  readonly workItemId: string;
  readonly title: string;
  readonly status: PlanStatus;
  readonly tasks: readonly PlanTask[];
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly model?: string;
  readonly tokenUsage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}
