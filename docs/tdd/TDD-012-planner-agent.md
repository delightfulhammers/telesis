# TDD-012 — Planner Agent

**Status:** Accepted
**Date:** 2026-03-13
**Author:** Delightful Hammers
**Related:** v0.16.0 milestone

---

## Overview

Telesis v0.15.0 added work intake — GitHub issues are imported, normalized, and dispatched
to coding agents. But `telesis intake approve` dispatches a single agent with the entire
work item as one monolithic task. For non-trivial issues, this is too coarse.

v0.16.0 adds a **planner agent** that decomposes a work item into an ordered list of
smaller, dispatchable tasks with dependency relationships. This is the bridge between
"here's a big issue" and "here are the concrete steps to implement it."

### What this TDD addresses

- Plan and PlanTask types with status lifecycles
- Per-plan JSON store in `.telesis/plans/` (atomic writes, prefix resolution)
- Topological sort with cycle detection (Kahn's algorithm) for dependency validation
- LLM-based work item decomposition via `ModelClient`
- System/user prompts for the planner agent
- Sequential task executor that dispatches each task via the existing `dispatch()` pipeline
- CLI commands (`telesis plan create|list|show|approve|execute`)
- Intake integration (`--plan` flag on approve)
- Plan-specific daemon events (`plan:*`)
- Planner config section in `.telesis/config.yml`

### What this TDD does not address (scope boundary)

- Parallel task execution (dispatching independent tasks concurrently)
- Automatic plan approval (auto-execute after create)
- Plan editing or task reordering after creation
- Reading full session output of predecessor tasks during execution
- Re-planning after partial failure
- Multi-plan coordination across work items
- Interactive TUI for plan review

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       CLI Process                             │
│                                                               │
│  telesis plan create <work-item-id>                          │
│    │                                                          │
│    ▼                                                          │
│  ┌──────────────────┐    ┌────────────────────┐               │
│  │  Planner Agent   │───▶│  Plan Store        │               │
│  │  (LLM decompose) │    │  .telesis/plans/   │               │
│  └──────────────────┘    └────────┬───────────┘               │
│                                   │                           │
│  telesis plan approve <id>        │                           │
│    │                              │                           │
│  telesis plan execute <id>        │                           │
│    │                              ▼                           │
│  ┌──────────────────┐    ┌────────────────────┐               │
│  │  Plan Executor   │───▶│  Dispatcher        │               │
│  │  (topo-order)    │    │  (existing)        │               │
│  └──────────────────┘    └────────────────────┘               │
│                                                               │
│  telesis intake approve <id> --plan                           │
│    │                                                          │
│    ▼                                                          │
│  ┌──────────────────┐                                         │
│  │  Approve → Plan  │  Creates draft plan instead of          │
│  │  (intake bridge) │  dispatching directly                   │
│  └──────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
```

All new code lives under `src/plan/`. The planner reuses `assembleDispatchContext()` for
project context, `dispatch()` for task execution, and `parseJsonResponse()` for LLM output
parsing.

---

## Types

### PlanTask

A single step within a plan. Tasks are scoped to their parent plan.

```typescript
const PLAN_TASK_STATUSES = ["pending", "running", "completed", "failed", "skipped"] as const;
type PlanTaskStatus = (typeof PLAN_TASK_STATUSES)[number];

interface PlanTask {
  readonly id: string;              // Short slug: "task-1", "task-2"
  readonly title: string;
  readonly description: string;     // Detailed instructions for coding agent
  readonly dependsOn: readonly string[];
  readonly status: PlanTaskStatus;
  readonly sessionId?: string;      // Links to dispatch session
  readonly completedAt?: string;
  readonly error?: string;
}
```

### Plan

The top-level decomposition of a work item into tasks.

```typescript
const PLAN_STATUSES = ["draft", "approved", "executing", "completed", "failed"] as const;
type PlanStatus = (typeof PLAN_STATUSES)[number];

interface Plan {
  readonly id: string;              // UUID
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
  readonly tokenUsage?: { readonly inputTokens: number; readonly outputTokens: number };
}
```

---

## Store Format

Per-plan JSON files in `.telesis/plans/`, following the `src/intake/store.ts` pattern:

- **Path:** `.telesis/plans/{uuid}.json`
- **Writes:** Atomic temp file + rename (no corruption on crash)
- **Reads:** JSON.parse with validation guard
- **Prefix resolution:** Supports both exact and unambiguous prefix matching
- **Dedup:** `findByWorkItemId(rootDir, workItemId)` scans all plans

### Store API

```typescript
createPlan(rootDir, plan): void          // atomic exclusive create (wx flag)
updatePlan(rootDir, plan): void          // atomic temp+rename
loadPlan(rootDir, idOrPrefix): Plan | null
listPlans(rootDir, filter?): readonly Plan[]
findByWorkItemId(rootDir, workItemId): Plan | null
```

---

## Validation

Pure functions with no I/O. Used after LLM output parsing and before plan persistence.

### topologicalSort

Implements Kahn's algorithm for dependency-order computation:

```typescript
type TopologicalSortResult =
  | { readonly valid: true; readonly order: readonly string[] }
  | { readonly valid: false; readonly error: string; readonly cycle?: readonly string[] };

topologicalSort(tasks: readonly PlanTask[]): TopologicalSortResult
```

### validatePlanTasks

Returns an array of error messages (empty if valid):

```typescript
validatePlanTasks(tasks: readonly PlanTask[]): readonly string[]
```

Checks:
- Duplicate task IDs
- Orphan dependency references (dependsOn points to non-existent task)
- Cycles (via topologicalSort)
- Empty task list
- Missing required fields (id, title, description)

---

## Planner Agent

The LLM-based decomposition function:

```typescript
interface PlannerResult {
  readonly tasks: readonly PlanTask[];
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: { readonly inputTokens: number; readonly outputTokens: number };
}

planWorkItem(
  client: ModelClient,
  rootDir: string,
  workItem: WorkItem,
  model?: string,
): Promise<PlannerResult>
```

### Prompt Design

**System prompt:** Project context (via `assembleDispatchContext()`) + planning instructions.
The instructions tell the model to decompose the work item into sequential tasks, each with
clear instructions for a coding agent, and to express dependencies between tasks.

**User prompt:** Work item content with untrusted content fencing (reuses the UUID fence
pattern from `src/intake/approve.ts`).

**Output format:** JSON array of task objects, parsed via `parseJsonResponse()`.

### Flow

1. Assemble project context via `assembleDispatchContext(rootDir)`
2. Build system prompt with context + planning instructions
3. Build user prompt with fenced work item content
4. Call `client.complete()` (structured JSON output, not streaming)
5. Parse response with `parseJsonResponse()`
6. Normalize task IDs and statuses
7. Validate with `validatePlanTasks()` + `topologicalSort()`
8. Return typed result with token usage

---

## Executor

Sequential execution of an approved plan's tasks in topological order:

```typescript
interface ExecutorDeps {
  readonly rootDir: string;
  readonly adapter: AgentAdapter;
  readonly agent: string;
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly maxConcurrent?: number;
}

interface ExecutionResult {
  readonly planId: string;
  readonly status: PlanStatus;
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly durationMs: number;
}

executePlan(deps: ExecutorDeps, plan: Plan): Promise<ExecutionResult>
```

### Execution Flow

1. Verify plan status is `approved`
2. Compute execution order via `topologicalSort()`
3. Transition plan to `executing` (persist)
4. For each task in topological order:
   a. Skip if already `completed` (crash recovery)
   b. Update task status to `running` (persist)
   c. Build task prompt with predecessor context (titles of completed tasks)
   d. Call `dispatch(deps, agent, taskPrompt)`
   e. On success: update task to `completed` with sessionId (persist)
   f. On failure: update task to `failed`, mark plan as `failed`, stop
5. If all tasks complete: transition plan to `completed` (persist)

### Crash Recovery

The executor persists plan state after each task status change. Re-running `execute` on a
partially-completed plan skips `completed` tasks and resumes from the first `pending` task
whose dependencies are met.

---

## Config Format

Added to `.telesis/config.yml` under a `planner` key:

```yaml
planner:
  model: claude-sonnet-4-6
  maxTasks: 10
```

All fields are optional. Missing config returns `{}` (lenient parsing).

```typescript
interface PlannerConfig {
  readonly model?: string;
  readonly maxTasks?: number;
}
```

---

## Event Types

New daemon events for plan operations:

| Event Type | Payload | Description |
|---|---|---|
| `plan:created` | `PlanEventPayload` | Plan created from work item |
| `plan:approved` | `PlanEventPayload` | Human approved plan |
| `plan:executing` | `PlanEventPayload` | Plan execution started |
| `plan:completed` | `PlanEventPayload` | All tasks completed |
| `plan:failed` | `PlanEventPayload` | Plan execution failed |
| `plan:task:started` | `PlanTaskEventPayload` | Task dispatch started |
| `plan:task:completed` | `PlanTaskEventPayload` | Task completed |
| `plan:task:failed` | `PlanTaskEventPayload` | Task failed |

```typescript
interface PlanEventPayload {
  readonly planId: string;
  readonly workItemId: string;
  readonly title: string;
}

interface PlanTaskEventPayload {
  readonly planId: string;
  readonly taskId: string;
  readonly title: string;
}
```

All plan events use the `"plan"` event source. TUI renders them in magenta.

---

## CLI Commands

```
telesis plan create <work-item-id>          # decompose work item via LLM
telesis plan list                           # list non-completed plans
telesis plan list --all                     # list all plans
telesis plan list --json                    # JSON output
telesis plan show <plan-id>                 # show plan with task graph
telesis plan approve <plan-id>              # transition draft → approved
telesis plan execute <plan-id>              # execute approved plan
telesis plan execute <plan-id> --agent <name>  # with specific agent
```

---

## Intake Integration

`telesis intake approve <id> --plan` creates a plan instead of dispatching directly:

1. Load work item, verify status is `pending`
2. Transition to `approved`
3. Call `planWorkItem()` to decompose via LLM
4. Create plan with status `draft`, persist
5. Print plan summary — user must then `telesis plan approve` + `telesis plan execute`

The work item stays in `approved` status until the plan is executed and all tasks complete.

---

## Decisions

1. **Task IDs are slugs, not UUIDs.** Tasks are scoped within a plan. `"task-1"` is
   more readable than a UUID in dependency lists, CLI output, and dispatch prompts.

2. **Sequential execution for v0.16.0.** Tasks dispatch one at a time in topological
   order. Parallel execution (dispatching independent tasks concurrently) is future work.

3. **Plan lifecycle requires human approval.** `create` produces a `draft`; the human
   reviews it; `approve` transitions to `approved`; `execute` runs it. No auto-execute.

4. **Reuse `dispatch()` directly.** The executor calls the existing `dispatch()` function
   for each task. No new agent adapter needed.

5. **Context for later tasks includes predecessor titles only.** When executing task-3,
   the prompt mentions what task-1 and task-2 accomplished (by title). Reading full
   session output of prior tasks is future work.

6. **Crash recovery is natural.** The executor persists plan state after each task.
   Re-running `execute` on a partially-completed plan skips `completed` tasks and
   resumes from the first `pending` task whose dependencies are met.

---

## Testing Strategy

- All tests colocated with source: `store.test.ts`, `validate.test.ts`, etc.
- Tests use `useTempDir()` from `src/test-utils.ts`
- Store tests cover CRUD, prefix resolution, dedup, filter, missing directory
- Validate tests cover cycle detection, orphan refs, duplicate IDs, empty tasks
- Planner tests use a mock `ModelClient` — no live API calls
- Executor tests use a fake dispatch adapter
