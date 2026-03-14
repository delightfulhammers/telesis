import type { AgentAdapter } from "../dispatch/adapter.js";
import type { ModelClient } from "../agent/model/client.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { ValidationConfig } from "../validation/types.js";
import type {
  GitConfig,
  PlannerConfig,
  DispatchConfig,
  PipelineConfig,
} from "../config/config.js";
import type { CommitResult, PushResult } from "../git/types.js";

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
}

/** Pipeline execution stages */
export type RunStage =
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "awaiting_gate"
  | "committing"
  | "pushing"
  | "creating_pr"
  | "closing_issue"
  | "completed"
  | "failed";

/** Result of a pipeline run */
export interface RunResult {
  readonly workItemId: string;
  readonly planId: string;
  readonly stage: RunStage;
  readonly commitResult?: CommitResult;
  readonly pushResult?: PushResult;
  readonly prUrl?: string;
  readonly error?: string;
  readonly durationMs: number;
}
