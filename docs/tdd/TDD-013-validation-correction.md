# TDD-013 — Validation & Correction

**Status:** Accepted
**Date:** 2026-03-13
**Author:** Delightful Hammers
**Related:** v0.17.0 milestone

---

## Overview

v0.16.0 added the planner agent — work items decompose into task plans that execute
sequentially via the dispatch pipeline. But when a task dispatches and the agent returns
"completed," nobody verifies the work actually meets the task description. A coding agent
can produce code that compiles but misses requirements, or partially implements a feature.

v0.17.0 adds a **validation agent** that inspects dispatch output (git diff + session
events) against the task's acceptance criteria, with automatic correction retries and
human escalation when retries are exhausted.

### What this TDD addresses

- Extended PlanTask/Plan statuses for validation lifecycle (`validating`, `correcting`, `escalated`, `awaiting_gate`)
- Validation types: `CriterionResult`, `ValidationVerdict`, `ValidationResult`
- Git diff capture between pre-dispatch ref and current HEAD
- Session event summarization for validator context
- LLM-based validation prompts (system/user) with untrusted content fencing
- Validation agent that checks each task criterion against actual output
- Correction prompt builder that feeds validation failures back to the coding agent
- Validate-correct loop integrated into the plan executor
- Milestone gates (`awaiting_gate` status with human approval)
- CLI commands: `--no-validate` flag, `retry`, `skip-task`, `gate-approve`
- Validation config section in `.telesis/config.yml`
- New daemon events for validation lifecycle

### What this TDD does not address (scope boundary)

- Per-criterion weighting or partial pass thresholds
- Automatic test execution as a validation signal (future work)
- Validation of non-code outputs (documentation, config changes)
- Cross-task validation (verifying task interactions)
- Custom validation scripts or hooks
- Parallel correction attempts

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Plan Executor                          │
│                                                              │
│  for each task in topological order:                         │
│                                                              │
│    preRef = captureRef(rootDir)                              │
│    ┌───────────────┐                                         │
│    │  dispatch()   │ ── coding agent executes task            │
│    └───────┬───────┘                                         │
│            │                                                 │
│            ▼                                                 │
│    ┌───────────────────┐                                     │
│    │  Validation Loop   │ (up to maxRetries attempts)        │
│    │                    │                                    │
│    │  diff = diffSinceRef(rootDir, preRef)                   │
│    │  summary = summarizeSessionEvents(...)                  │
│    │                    │                                    │
│    │  ┌──────────────┐  │                                    │
│    │  │ validateTask │  │ ── LLM checks criteria vs diff     │
│    │  └──────┬───────┘  │                                    │
│    │         │          │                                    │
│    │    pass? ──yes──▶ completed                             │
│    │         │          │                                    │
│    │        no          │                                    │
│    │         │          │                                    │
│    │  ┌──────────────┐  │                                    │
│    │  │ correction   │  │ ── build correction prompt          │
│    │  │ dispatch()   │  │ ── re-dispatch with feedback        │
│    │  └──────────────┘  │                                    │
│    │                    │                                    │
│    └───────────────────┘                                     │
│            │                                                 │
│      retries exhausted? ──▶ escalated (plan paused)          │
│                                                              │
│  all tasks done + enableGates? ──▶ awaiting_gate             │
│  all tasks done? ──▶ completed                               │
└──────────────────────────────────────────────────────────────┘
```

New code lives under `src/validation/`. The validator reuses `ModelClient` for LLM calls,
`parseJsonResponse()` for output parsing, and `assembleDispatchContext()` for project
context. The correction loop reuses `dispatch()` from the existing pipeline.

---

## Types

### Extended PlanTask/Plan Statuses

```typescript
// src/plan/types.ts — extended
const PLAN_TASK_STATUSES = [
  "pending", "running", "completed", "failed", "skipped",
  "validating", "correcting", "escalated",
] as const;

const PLAN_STATUSES = [
  "draft", "approved", "executing", "completed", "failed",
  "escalated", "awaiting_gate",
] as const;
```

### New PlanTask Fields

```typescript
interface PlanTask {
  // ... existing fields ...
  readonly validationAttempts?: number;
  readonly validationErrors?: readonly string[];
  readonly correctionSessionIds?: readonly string[];
}
```

### Validation Types

```typescript
// src/validation/types.ts

interface CriterionResult {
  readonly criterion: string;
  readonly met: boolean;
  readonly evidence: string;
}

interface ValidationVerdict {
  readonly passed: boolean;
  readonly criteria: readonly CriterionResult[];
  readonly summary: string;
}

interface ValidationResult {
  readonly verdict: ValidationVerdict;
  readonly model?: string;
  readonly durationMs: number;
  readonly tokenUsage: { readonly inputTokens: number; readonly outputTokens: number };
}
```

---

## Diff Capture

```typescript
// src/validation/diff-capture.ts

/** Capture HEAD sha before dispatch */
captureRef(rootDir: string): string

/** Get unified diff between a ref and current HEAD */
diffSinceRef(rootDir: string, ref: string): string
// Truncates to MAX_DIFF_CHARS (200,000) with note

/** Summarize session events into a text synopsis for the validator */
summarizeSessionEvents(rootDir: string, sessionId: string, maxChars?: number): string
// Loads session events, filters for "output" and "tool_call" types, extracts text
```

Uses `execFileSync("git", ...)` following the pattern in `src/agent/review/diff.ts`.

---

## Validation Agent

### Prompts

**System prompt:** `buildValidationSystemPrompt(contextPrompt)` — instructs the LLM to
act as a verification agent. Given a task description and actual output (diff + session
summary), determine whether each criterion in the task is met. Output format is JSON
`{ passed, criteria, summary }`.

**User prompt:** `buildValidationUserPrompt(task, diff, sessionSummary)` — fences the
task description as UNTRUSTED (same UUID fence pattern as planner prompts). Includes the
diff and session summary with length caps.

### Validator

```typescript
// src/validation/validator.ts

validateTask(
  client: ModelClient,
  task: PlanTask,
  diff: string,
  sessionSummary: string,
  rootDir: string,
  model?: string,
): Promise<ValidationResult>
```

Calls `client.complete()`, parses JSON via `parseJsonResponse()`, normalizes the verdict,
returns a typed result.

---

## Correction

```typescript
// src/validation/correction.ts

buildCorrectionPrompt(
  task: PlanTask,
  diff: string,
  verdict: ValidationVerdict,
  attempt: number,
): string
```

Includes: original task description, what was attempted (diff summary), validation
failures with specific criteria, attempt number, instructions to fix only the failing
criteria.

---

## Executor Integration

After `dispatch()` returns "completed," if validation is enabled (maxRetries > 0), the
executor enters the validation loop:

1. `preRef` is captured once before the first dispatch
2. After dispatch: `diff = diffSinceRef(rootDir, preRef)`, `summary = summarizeSessionEvents(...)`
3. For each attempt (1..maxRetries):
   a. Emit `validation:started`, mark task `validating`
   b. Call `validateTask()` — LLM evaluates criteria
   c. If passed: emit `validation:passed`, mark task `completed`, break
   d. If failed and retries remain: emit `validation:failed`, `validation:correction:started`
   e. Mark task `correcting`, build correction prompt, re-dispatch
   f. Re-diff from original `preRef` (accumulates all changes)
4. If all retries exhausted: emit `validation:escalated`, mark task `escalated`, mark plan `escalated`

**Key detail:** `preRef` captured once before first dispatch and reused across correction
attempts. The validator always sees the full delta from the original state, not incremental
correction diffs.

### Extended ExecutorDeps

```typescript
interface ExecutorDeps {
  // ... existing fields ...
  readonly modelClient: ModelClient;
  readonly validationConfig: ValidationConfig;
}
```

---

## Milestone Gates

After all tasks complete, if `validationConfig.enableGates` is true:
- Set plan status to `"awaiting_gate"` instead of `"completed"`
- Emit `plan:awaiting_gate` event
- Return with status `"awaiting_gate"`

Human approves via `telesis plan gate-approve <plan-id>`.

---

## Config Format

Added to `.telesis/config.yml` under a `validation` key:

```yaml
validation:
  model: claude-sonnet-4-6
  maxRetries: 3
  enableGates: false
```

All fields are optional. Missing config returns `{}` (lenient parsing).

```typescript
interface ValidationConfig {
  readonly model?: string;
  readonly maxRetries?: number;      // default 3
  readonly enableGates?: boolean;    // default false
}
```

---

## Event Types

New daemon events for validation operations:

| Event Type | Payload | Description |
|---|---|---|
| `validation:started` | `ValidationEventPayload` | Validation check started |
| `validation:passed` | `ValidationEventPayload` | All criteria met |
| `validation:failed` | `ValidationEventPayload` | One or more criteria failed |
| `validation:correction:started` | `ValidationEventPayload` | Correction dispatch started |
| `validation:escalated` | `ValidationEventPayload` | Retries exhausted, human needed |
| `plan:awaiting_gate` | `PlanEventPayload` | Plan awaiting milestone gate approval |

```typescript
interface ValidationEventPayload {
  readonly planId: string;
  readonly taskId: string;
  readonly attempt: number;
}
```

All validation events use the `"validation"` event source. TUI renders them in yellow.

---

## CLI Commands

```
telesis plan execute <plan-id>                    # execute with validation (default)
telesis plan execute <plan-id> --no-validate      # skip validation loop
telesis plan execute <plan-id> --agent <name>     # with specific agent
telesis plan retry <plan-id>                      # re-execute from escalated/failed task
telesis plan skip-task <plan-id> <task-id>        # skip escalated task, resume
telesis plan gate-approve <plan-id>               # transition awaiting_gate → completed
```

### Execute with validation

`execute` always wires up a ModelClient + validationConfig. `--no-validate` sets
`maxRetries: 0` to skip the validation loop entirely.

### Retry

Re-executes an escalated or failed plan from the first non-completed task. Resets
escalated/failed tasks to pending.

### Skip task

Marks an escalated task as `skipped`, then resumes plan execution from the next task.

### Gate approve

Transitions a plan from `awaiting_gate` to `completed`.

---

## Decisions

1. **Validation fields live on PlanTask, not a separate store.** The plan file is the
   single source of truth for task lifecycle. Adding optional fields avoids cross-store
   consistency problems and makes `telesis plan show` display validation state for free.

2. **Validation is on by default.** No installed user base to preserve backward
   compatibility for. `--no-validate` disables it (sets `maxRetries: 0`).

3. **preRef captured once before first dispatch.** Correction attempts accumulate changes
   in the working tree. The validator always sees the full delta from the original state,
   not incremental correction diffs. This gives an accurate picture of total progress.

4. **No separate validation store.** Validation results are ephemeral — what matters is
   the final task status (completed, escalated). The validation verdict details are in
   `validationErrors` on PlanTask, not a separate JSON file.

5. **Escalation pauses the plan.** An escalated plan stays in `"escalated"` status until
   a human runs `plan retry` or `plan skip-task`. Consistent with the human-in-the-loop
   principle.

6. **Milestone gates are opt-in via config.** `enableGates: true` in validation config
   adds an `awaiting_gate` pause after all tasks complete. Simplest useful gate — future
   work can add per-milestone gate criteria.

7. **Correction retries reuse dispatch().** No special retry mechanism — we just call
   `dispatch()` again with an augmented prompt. Each correction gets its own sessionId,
   tracked in `correctionSessionIds` on the task.

---

## Testing Strategy

- All tests colocated with source: `diff-capture.test.ts`, `prompts.test.ts`, etc.
- Tests use `useTempDir()` from `src/test-utils.ts`
- Diff capture tests use real git repos (init + commit + modify)
- Prompts tests verify fencing, truncation, and output structure
- Validator tests use a mock `ModelClient` — no live API calls
- Correction tests verify prompt includes original task + failure details
- Executor tests extend existing tests with validation scenarios:
  - Task passes validation on first try
  - Task fails, correction succeeds
  - Retries exhausted → escalation
  - `--no-validate` skips validation
  - Milestone gate pauses completion
