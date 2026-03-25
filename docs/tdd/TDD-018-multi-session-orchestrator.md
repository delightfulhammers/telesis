# TDD-018 — Multi-Session Orchestrator

**Status:** Accepted
**Date:** 2026-03-25
**Author:** Delightful Hammers
**Related:** v0.28.0 milestone, TDD-016 (Orchestrator)

---

## Overview

The orchestrator currently assumes a single continuous agent session per milestone. In practice,
sessions end mid-milestone — context fills up, a hook blocks a commit, the process crashes, or
the user kills the session. When a new session starts, the human must manually reconstruct what
happened and where to resume. This TDD addresses that gap.

The multi-session orchestrator adds three capabilities:

1. **Mid-execution checkpointing** — the orchestrator tracks task progress in real time so
   resumption starts from the last completed task, not from scratch.
2. **Session tracking** — the orchestrator records which session is active, when it started,
   and why it ended, so the next session has forensic context.
3. **Resume briefing** — a structured orientation artifact that inspects orchestrator state,
   git workspace status, and session history to produce an actionable summary for the
   incoming session.

### What this TDD addresses

- Session identity and lifecycle fields on `OrchestratorContext`
- Exit reason classification and persistence
- `currentTaskIndex` checkpointing during plan execution
- Resume briefing generation (CLI command + MCP tool)
- Workspace state inspection (uncommitted changes, staged files, last commit)
- Recovery path recommendation based on exit reason + workspace state

### What this TDD does not address (scope boundary)

- Daemon-driven session restart (v0.29.0)
- Automatic session death detection (v0.29.0)
- Provider-neutral enforcement (v0.30.0)
- Session history store (v0.29.0 — `.telesis/sessions/`)
- Context window token counting or overflow detection
- Parallel task execution

---

## Architecture

```
                    Session N dies
                         │
                         ▼
              ┌──────────────────────┐
              │  OrchestratorContext  │
              │  .telesis/           │
              │  orchestrator.json   │
              │                      │
              │  state: executing    │
              │  sessionId: abc      │
              │  sessionExitReason:  │
              │    hook_block        │
              │  currentTaskIndex: 3 │
              └──────────┬───────────┘
                         │
                    Session N+1 starts
                         │
                         ▼
              ┌──────────────────────┐
              │   Resume Briefing    │
              │                      │
              │  1. Load context     │
              │  2. Inspect git      │
              │     working tree     │
              │  3. Match exit       │
              │     reason to        │
              │     workspace state  │
              │  4. Recommend        │
              │     recovery action  │
              └──────────────────────┘
```

### Modified packages

| Package | Change |
|---------|--------|
| `src/orchestrator/types.ts` | Session fields on `OrchestratorContext`, `SessionExitReason` type |
| `src/orchestrator/persistence.ts` | No changes — already handles arbitrary context fields |
| `src/orchestrator/runner.ts` | Set session fields on `executing` entry, checkpoint task index |
| `src/orchestrator/deps.ts` | New deps: `getSessionId`, `endSession` |
| `src/orchestrator/resume.ts` | **New** — resume briefing generation |
| `src/cli/orchestrator.ts` | New `resume-briefing` subcommand |
| `src/mcp/tools/orchestrator.ts` | New `telesis_orchestrator_resume_briefing` tool |
| `src/plan/executor.ts` | Callback for task completion checkpointing |

### New files

| File | Purpose |
|------|---------|
| `src/orchestrator/resume.ts` | Resume briefing: workspace inspection, exit reason analysis, recovery recommendation |
| `src/orchestrator/resume.test.ts` | Unit tests for resume briefing generation |

---

## Types

### Session fields on OrchestratorContext

```typescript
/** Why the last agent session ended */
export type SessionExitReason =
  | "hook_block"     // preflight or commit hook blocked the action
  | "context_full"   // context window exhausted (detected by caller)
  | "error"          // unhandled error / crash
  | "clean"          // session completed normally
  | "unknown";       // session ended without reporting a reason

export interface OrchestratorContext {
  // ... existing fields ...

  /** ID of the currently active (or most recent) agent session */
  readonly sessionId?: string;
  /** When the current/most recent session started */
  readonly sessionStartedAt?: string;
  /** When the most recent session ended (undefined if session is active) */
  readonly sessionEndedAt?: string;
  /** Why the most recent session ended */
  readonly sessionExitReason?: SessionExitReason;
}
```

### Resume Briefing

```typescript
export interface ResumeBriefing {
  /** Current orchestrator state */
  readonly state: OrchestratorState;
  /** Milestone context */
  readonly milestoneId?: string;
  readonly milestoneName?: string;
  /** Last session info */
  readonly lastSessionId?: string;
  readonly lastSessionExitReason?: SessionExitReason;
  readonly lastSessionEndedAt?: string;
  /** Task progress */
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly currentTaskIndex: number;
  readonly currentTaskTitle?: string;
  /** Workspace state */
  readonly hasUncommittedChanges: boolean;
  readonly hasStagedChanges: boolean;
  readonly lastCommitSummary?: string;
  /** Pending decisions */
  readonly pendingDecisions: readonly { kind: string; summary: string }[];
  /** Recommended recovery action */
  readonly recommendation: string;
}
```

---

## Key Design Decisions

### 1. Session ID is caller-provided, not generated

The orchestrator doesn't spawn sessions — it receives them. The caller (MCP tool, CLI, daemon)
provides a session ID when starting execution. This keeps the orchestrator pure: it records
what it's told, it doesn't manage session lifecycle.

For Claude Code, the session ID can come from the MCP connection context or be generated by the
MCP tool on `orchestrator_run`. For CLI invocation, a UUID is generated per `run` command.

### 2. Exit reason is set explicitly, not inferred

The orchestrator exposes an `endSession(reason)` dep that the caller invokes when the session
ends. This is more reliable than trying to infer exit reasons from error states:

- **hook_block**: The preflight hook or commit hook reports the block, the caller calls
  `endSession("hook_block")`.
- **clean**: The orchestrator reaches a waiting state (decision needed) or idle; caller calls
  `endSession("clean")`.
- **error**: A catch block in the caller calls `endSession("error")`.
- **context_full**: The LLM client or session wrapper detects truncation and calls
  `endSession("context_full")`.
- **unknown**: Fallback. If no `endSession` was called (crash, kill -9), the next session
  sees `sessionEndedAt` is undefined but `sessionId` is set — it classifies this as `unknown`.

### 3. Task checkpointing uses the existing plan store, not orchestrator context

The plan executor already persists per-task status (`completed`, `failed`, `pending`) to the
plan store. Rather than duplicating this into `currentTaskIndex` on the orchestrator context,
the resume briefing reads the plan store directly to determine task progress.

The `currentTaskIndex` on `OrchestratorContext` is updated as a convenience for status display
and quick resumption, but the plan store is the source of truth for task-level state. This
avoids a consistency problem where the two stores could disagree.

### 4. Resume briefing is read-only and stateless

The resume briefing inspects state and produces a summary. It never mutates state, never starts
execution, never resolves decisions. It is safe to call repeatedly. This makes it usable as
both an MCP tool (called by the incoming agent) and a CLI command (called by a human debugging).

### 5. Workspace inspection uses git porcelain

The briefing runs `git status --porcelain` and `git log -1 --oneline` to assess workspace
state. This is fast, reliable, and doesn't require any telesis-specific instrumentation.
The combination of exit reason + workspace state drives the recommendation:

| Exit Reason | Uncommitted Changes | Recommendation |
|-------------|-------------------|----------------|
| `hook_block` | Yes (staged) | "Previous session completed work but was blocked by preflight. Run review convergence, then commit." |
| `hook_block` | No | "Previous session was blocked by preflight but changes were not preserved. Check git stash or reflog." |
| `context_full` | Yes | "Previous session ran out of context. Uncommitted changes may be partial. Assess completeness before proceeding." |
| `error` | Yes | "Previous session errored. Uncommitted changes may be incomplete. Review changes carefully." |
| `clean` | No | "Previous session ended normally. Continue from current orchestrator state." |
| `unknown` | Yes | "Previous session ended without reporting. Uncommitted changes exist — assess before proceeding." |
| `unknown` | No | "Previous session ended without reporting. No uncommitted changes. Continue from current state." |

### 6. MCP tool returns structured JSON, not prose

The `telesis_orchestrator_resume_briefing` MCP tool returns the `ResumeBriefing` struct as
JSON. The LLM client formats it into whatever context is appropriate. The CLI command formats
it as human-readable text. This separation avoids baking presentation into the data layer.

---

## Integration Points

### Runner → Session Tracking

When `advanceExecuting` is called, it sets session fields before dispatching:

```typescript
const advanceExecuting = async (ctx, deps) => {
  // Set session on first entry to executing
  const sessionCtx = ctx.sessionId
    ? ctx
    : {
        ...ctx,
        sessionId: deps.getSessionId(),
        sessionStartedAt: new Date().toISOString(),
        sessionEndedAt: undefined,
        sessionExitReason: undefined,
      };

  // ... existing execution logic ...
};
```

### Plan Executor → Task Checkpoint Callback

The plan executor already persists task status. The orchestrator's `executeTasks` dep reads
the plan store after execution returns to update `currentTaskIndex`:

```typescript
executeTasks: async (planId) => {
  // ... existing execution ...
  const result = await executePlan(executorDeps, plan);

  // Checkpoint: read plan store for completed count
  const updatedPlan = loadPlan(rootDir, planId);
  const completedCount = updatedPlan?.tasks.filter(
    t => t.status === "completed"
  ).length ?? 0;

  return {
    allComplete: result.status === "completed",
    error: result.status !== "completed"
      ? `Plan ended with status: ${result.status}`
      : undefined,
    completedTaskCount: completedCount,
  };
},
```

The runner persists the updated index:

```typescript
const result = await deps.executeTasks(ctx.planId);
const checkpointedCtx = {
  ...ctx,
  currentTaskIndex: result.completedTaskCount,
};
await deps.saveContext(checkpointedCtx);
```

### MCP Tool → Session Lifecycle

The `telesis_orchestrator_run` MCP tool manages session identity:

```typescript
// On run start
const sessionId = crypto.randomUUID();
ctx = { ...ctx, sessionId, sessionStartedAt: new Date().toISOString() };

// On clean completion (waiting or idle)
ctx = { ...ctx, sessionEndedAt: new Date().toISOString(), sessionExitReason: "clean" };

// On error
ctx = { ...ctx, sessionEndedAt: new Date().toISOString(), sessionExitReason: "error" };
```

### Resume Briefing → Workspace Inspection

```typescript
import { execFileSync } from "node:child_process";

const inspectWorkspace = (rootDir: string): WorkspaceState => {
  const porcelain = execFileSync("git", ["status", "--porcelain"], {
    cwd: rootDir,
    encoding: "utf-8",
  });

  const staged = porcelain
    .split("\n")
    .filter(line => /^[MADRC]/.test(line));

  const unstaged = porcelain
    .split("\n")
    .filter(line => /^.[MADRC]/.test(line));

  const lastCommit = execFileSync(
    "git", ["log", "-1", "--oneline"],
    { cwd: rootDir, encoding: "utf-8" }
  ).trim();

  return {
    hasUncommittedChanges: porcelain.trim().length > 0,
    hasStagedChanges: staged.length > 0,
    hasUnstagedChanges: unstaged.length > 0,
    lastCommitSummary: lastCommit || undefined,
  };
};
```

---

## CLI Interface

### `telesis orchestrator resume-briefing`

```
$ telesis orchestrator resume-briefing

Resume Briefing
───────────────
State:          executing
Milestone:      v0.28.0 — Multi-Session Orchestrator
Last session:   abc123 (ended 2026-03-25T14:30:00Z, reason: hook_block)

Task Progress:  3/5 complete
  ✓ task-1: Add session fields to OrchestratorContext
  ✓ task-2: Implement task checkpointing in executor
  ✓ task-3: Build resume briefing generator
  → task-4: Add resume-briefing CLI command
  · task-5: Add resume-briefing MCP tool

Workspace:
  Staged changes: 4 files
  Unstaged changes: none
  Last commit: abc1234 feat: resume briefing generator

Recommendation:
  Previous session completed work but was blocked by preflight.
  Run review convergence, then commit.
```

---

## Test Strategy

- **Session tracking unit tests:** Verify session fields are set on executing entry, updated
  on session end, preserved across state transitions, and cleared on milestone completion.
- **Task checkpoint tests:** Verify `currentTaskIndex` is updated after `executeTasks` returns,
  and that resumed execution skips completed tasks (this is already tested in the plan executor
  but should also be tested at the orchestrator level).
- **Resume briefing unit tests:** Given various combinations of orchestrator state, exit reason,
  and workspace state (mocked git output), verify the correct recommendation is produced.
  Cover all cells in the exit-reason × workspace-state matrix.
- **Resume briefing integration tests:** Use temp directories with real git repos to verify
  workspace inspection produces correct results.
- **Exit reason classification tests:** Verify that a session with no `endSession` call
  produces `unknown` reason on next resume briefing.
- **MCP tool tests:** Verify `telesis_orchestrator_resume_briefing` returns well-formed
  `ResumeBriefing` JSON.
- **CLI formatting tests:** Verify human-readable output formatting.
- **All tests use temp directories.** No live daemon, no live LLM calls, no real git repos
  (except integration tests that create throwaway repos).
