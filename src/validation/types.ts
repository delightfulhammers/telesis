/** Result of evaluating a single criterion against task output */
export interface CriterionResult {
  readonly criterion: string;
  readonly met: boolean;
  readonly evidence: string;
}

/** LLM verdict on whether a task's output meets its criteria */
export interface ValidationVerdict {
  readonly passed: boolean;
  readonly criteria: readonly CriterionResult[];
  readonly summary: string;
}

/** Full result from a validation attempt, including telemetry */
export interface ValidationResult {
  readonly verdict: ValidationVerdict;
  readonly model?: string;
  readonly durationMs: number;
  readonly tokenUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

/** Config for the validation subsystem, parsed from .telesis/config.yml */
export interface ValidationConfig {
  readonly model?: string;
  readonly maxRetries?: number;
  readonly enableGates?: boolean;
}

/** Default max retries when validation is enabled */
export const DEFAULT_MAX_RETRIES = 3;
