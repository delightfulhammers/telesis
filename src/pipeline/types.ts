import type { AgentAdapter } from "../dispatch/adapter.js";
import type { ModelClient } from "../agent/model/client.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { ValidationConfig } from "../validation/types.js";
import type {
  GitConfig,
  PlannerConfig,
  DispatchConfig,
  PipelineConfig,
  ReviewBlockThreshold,
} from "../config/config.js";
import type { CommitResult, PushResult } from "../git/types.js";
import type { ReviewFinding } from "../agent/review/types.js";

/** Ordered pipeline stages — used for resume skip logic */
export const STAGE_ORDER: readonly RunStage[] = [
  "planning",
  "awaiting_approval",
  "executing",
  "awaiting_gate",
  "committing",
  "quality_check",
  "reviewing",
  "pushing",
  "creating_pr",
  "closing_issue",
  "completed",
] as const;

/** Check whether `current` is strictly past `target` in the stage ordering.
 *  Throws if either stage is not in STAGE_ORDER (terminal/error stages are not resumable). */
export const isPastStage = (current: RunStage, target: RunStage): boolean => {
  const currentIdx = STAGE_ORDER.indexOf(current);
  const targetIdx = STAGE_ORDER.indexOf(target);
  if (currentIdx === -1) {
    throw new TypeError(
      `Stage "${current}" is not in STAGE_ORDER — terminal stages are not resumable`,
    );
  }
  if (targetIdx === -1) {
    throw new TypeError(
      `Stage "${target}" is not in STAGE_ORDER — terminal stages are not resumable`,
    );
  }
  return currentIdx > targetIdx;
};

/** Quality gate types */
export type QualityGateName = "format" | "lint" | "test" | "build" | "drift";

export interface QualityGateResult {
  readonly gate: QualityGateName;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly error?: string;
  readonly amended?: boolean;
}

export interface QualityGateSummary {
  readonly ran: boolean;
  readonly passed: boolean;
  readonly results: readonly QualityGateResult[];
}

/** Dependencies injected into the pipeline orchestrator */
export interface RunDeps {
  readonly rootDir: string;
  readonly adapter: AgentAdapter;
  readonly agent: string;
  readonly modelClient: ModelClient;
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly gitConfig: GitConfig;
  readonly pipelineConfig: PipelineConfig;
  readonly validationConfig: ValidationConfig;
  readonly plannerConfig: PlannerConfig;
  readonly dispatchConfig: DispatchConfig;
  readonly confirm: (message: string) => Promise<boolean>;
  readonly runDriftChecks?: (rootDir: string) => { passed: boolean };
  readonly execCommand?: (command: string, cwd: string) => void;
}

/** Pipeline execution stages */
export type RunStage =
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "awaiting_gate"
  | "quality_check"
  | "quality_check_failed"
  | "reviewing"
  | "review_failed"
  | "committing"
  | "pushing"
  | "creating_pr"
  | "closing_issue"
  | "completed"
  | "failed";

/** Summary of the review stage within a pipeline run */
export interface ReviewSummary {
  readonly ran: boolean;
  readonly passed: boolean;
  readonly totalFindings: number;
  readonly blockingFindings: number;
  readonly threshold: ReviewBlockThreshold;
  readonly findings: readonly ReviewFinding[];
}

/** Persisted state for pipeline resumability */
export interface PipelineState {
  readonly workItemId: string;
  readonly planId: string;
  readonly currentStage: RunStage;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly preExecutionSha?: string;
  readonly branch?: string;
  readonly commitResult?: CommitResult;
  readonly qualityGateSummary?: QualityGateSummary;
  readonly reviewSummary?: ReviewSummary;
  readonly pushResult?: PushResult;
  readonly prUrl?: string;
}

/** Options for running the pipeline */
export interface RunOptions {
  readonly branchOverride?: string;
  readonly resumeState?: PipelineState;
}

/** Result of a pipeline run */
export interface RunResult {
  readonly workItemId: string;
  readonly planId: string;
  readonly stage: RunStage;
  readonly commitResult?: CommitResult;
  readonly pushResult?: PushResult;
  readonly prUrl?: string;
  readonly reviewSummary?: ReviewSummary;
  readonly qualityGateSummary?: QualityGateSummary;
  readonly resumed?: boolean;
  readonly resumedFromStage?: RunStage;
  readonly error?: string;
  readonly durationMs: number;
}
