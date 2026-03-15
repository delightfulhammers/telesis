# TDD-016 — Orchestrator

**Status:** Accepted
**Date:** 2026-03-15
**Author:** Delightful Hammers
**Related:** v0.22.0 milestone, orchestrator-state-machine.md spec

---

## Overview

The orchestrator is a deterministic state machine that lives inside the daemon process and
enforces the full development lifecycle. It is the missing piece that turns Telesis from a
collection of tools into a feedback and control system.

Today, the human is the orchestrator — remembering to create milestone entries, write TDDs,
run review until convergence, execute the completion workflow. Both humans and coding agents
are inconsistent at this. The orchestrator makes the process mechanical: it always follows
the sequence, never skips steps, and surfaces only meaningful decisions to the human.

### What this TDD addresses

- Orchestrator state machine with 10 lifecycle states and enforced transitions
- Integration with the daemon process (event bus subscription, lifecycle coupling)
- Persistent state for crash recovery (`.telesis/orchestrator.json`)
- Decision queue for human-in-the-loop gates (`.telesis/decisions/`)
- LLM-augmented judgment at TRIAGE and MILESTONE_SETUP
- Review convergence loop (automated review-fix-review cycle)
- Milestone completion automation (version bump, doc updates, commit, tag, push)
- CLI commands for orchestrator interaction (`status`, `approve`, `reject`)
- Claude Code hooks for preflight checks (`telesis preflight`)
- OS notifications for decision surfacing (macOS)
- Orchestrator event types on the daemon bus

### What this TDD does not address (scope boundary)

- Parallel work item execution (serial only in v0.22.0)
- Multi-project orchestration
- Configurable HITL thresholds (all 7 decision points require human approval)
- Configurable review convergence thresholds (hardcoded: new + persistent ≤ 3)
- TUI or web UI for orchestrator interaction (CLI + OS notifications only)
- User documentation generation triggers
- Ops runbook update triggers
- Autonomous agent subscription to event bus (orchestrator manages agent lifecycle)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DAEMON PROCESS                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    ORCHESTRATOR                           │  │
│  │                                                          │  │
│  │  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │  │
│  │  │ State Machine │   │ Decision     │   │ LLM Calls   │ │  │
│  │  │ (10 states,  │   │ Queue        │   │ (Haiku,     │ │  │
│  │  │  enforced    │   │ (.telesis/   │   │  targeted)  │ │  │
│  │  │  transitions)│   │  decisions/) │   │             │ │  │
│  │  └──────┬───────┘   └──────┬───────┘   └──────┬──────┘ │  │
│  │         │                  │                   │        │  │
│  │         └──────────────────┼───────────────────┘        │  │
│  │                            │                            │  │
│  │                    calls existing                       │  │
│  │                    business logic                       │  │
│  └────────────────────────────┼────────────────────────────┘  │
│                               │                               │
│  ┌────────────────────────────┼────────────────────────────┐  │
│  │                      EVENT BUS                          │  │
│  │  orchestrator:* events   ←→   intake/plan/dispatch/*    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────┐  ┌───────────┐  ┌────────────┐               │
│  │ FS Watcher │  │ Socket    │  │ Heartbeat  │               │
│  └────────────┘  └───────────┘  └────────────┘               │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │              OS Notifications      Claude Code Hooks
         │              (decision needed)     (preflight gates)
         ▼
   Coding Agents
   (Claude Code
    via dispatch)
```

### New packages

| Package | Purpose |
|---------|---------|
| `src/orchestrator/` | State machine, decision queue, LLM judgment, persistence |

### New files (estimated)

| File | Purpose |
|------|---------|
| `src/orchestrator/types.ts` | OrchestratorState, Decision, TransitionEvent types |
| `src/orchestrator/machine.ts` | State machine: states, transitions, precondition enforcement |
| `src/orchestrator/persistence.ts` | Load/save orchestrator state to `.telesis/orchestrator.json` |
| `src/orchestrator/decisions.ts` | Decision queue: create, list, resolve, persist |
| `src/orchestrator/judgment.ts` | LLM calls: triage grouping, TDD necessity |
| `src/orchestrator/convergence.ts` | Review-fix-review loop orchestration |
| `src/orchestrator/notify.ts` | OS notification dispatch (macOS `osascript`) |
| `src/orchestrator/hooks.ts` | Claude Code hook definitions and preflight check logic |
| `src/orchestrator/runner.ts` | Main loop: subscribe to bus, drive state transitions |
| `src/cli/orchestrator.ts` | CLI commands: status, approve, reject |
| `src/cli/preflight.ts` | `telesis preflight` command for hook integration |

### Reused subsystems

| Subsystem | Used in state |
|-----------|---------------|
| `src/intake/` | INTAKE — work item sync |
| `src/plan/` | PLANNING, EXECUTING — task decomposition and execution |
| `src/dispatch/` | EXECUTING — coding agent dispatch |
| `src/validation/` | EXECUTING — task output validation |
| `src/pipeline/quality-gates.ts` | POST_TASK — format, lint, test, build |
| `src/agent/review/pipeline.ts` | REVIEWING — review execution |
| `src/milestones/` | MILESTONE_CHECK, MILESTONE_COMPLETE — validation and completion |
| `src/drift/` | MILESTONE_CHECK — drift detection |
| `src/context/` | MILESTONE_COMPLETE — CLAUDE.md regeneration |
| `src/agent/model/client.ts` | TRIAGE, MILESTONE_SETUP — LLM judgment calls |
| `src/daemon/bus.ts` | Event subscription and emission |

---

## Types

### Orchestrator State (`src/orchestrator/types.ts`)

```typescript
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

export interface OrchestratorContext {
  readonly state: OrchestratorState;
  readonly milestoneId?: string;        // version string, e.g. "0.22.0"
  readonly milestoneName?: string;      // e.g. "Orchestrator Walking Skeleton"
  readonly workItemIds: readonly string[];
  readonly planId?: string;
  readonly currentTaskIndex?: number;
  readonly reviewRound?: number;
  readonly reviewFindings?: number;      // findings from last review
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly error?: string;
}
```

### Decision (`src/orchestrator/types.ts`)

```typescript
export type DecisionKind =
  | "triage_approval"       // approve milestone scope
  | "milestone_approval"    // approve milestone definition + TDD
  | "plan_approval"         // approve task plan
  | "escalation"            // task failed after retries
  | "convergence_failure"   // review won't converge
  | "criteria_confirmation" // manual acceptance criteria met?
  | "ship_confirmation";    // final push approval

export interface Decision {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly createdAt: string;
  readonly summary: string;           // human-readable description
  readonly detail: string;            // full context (JSON or markdown)
  readonly resolvedAt?: string;
  readonly resolution?: "approved" | "rejected";
  readonly reason?: string;           // rejection reason
}
```

### Orchestrator Events

```typescript
// New event types added to daemon event union
export type OrchestratorEventType =
  | "orchestrator:state_changed"
  | "orchestrator:decision_created"
  | "orchestrator:decision_resolved"
  | "orchestrator:judgment_called"
  | "orchestrator:error";

export interface OrchestratorStatePayload {
  readonly fromState: OrchestratorState;
  readonly toState: OrchestratorState;
  readonly milestoneId?: string;
}

export interface OrchestratorDecisionPayload {
  readonly decisionId: string;
  readonly kind: DecisionKind;
  readonly summary: string;
}

export interface OrchestratorJudgmentPayload {
  readonly question: string;
  readonly answer: string;
  readonly model: string;
  readonly tokenUsage: { inputTokens: number; outputTokens: number };
}
```

### Preflight Check Result

```typescript
export interface PreflightResult {
  readonly passed: boolean;
  readonly checks: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly message: string;
  }[];
}
```

---

## Key Design Decisions

### 1. Deterministic state machine, not an LLM agent

The orchestrator is code that always follows the sequence. It never reasons about what to do
next — the state machine defines that. LLM calls are scoped to specific questions:

- TRIAGE: "Given these work items, suggest logical groupings for milestones"
- MILESTONE_SETUP: "Given this milestone scope, does it introduce a new subsystem that
  needs a TDD?"

The LLM never controls flow. It answers questions. The state machine acts on the answers.

### 2. Decision queue, not interactive prompts

Human decisions are written to `.telesis/decisions/<id>.json` as pending items. The
orchestrator continues on non-blocking work (if any) while waiting. CLI commands resolve
decisions. This is fundamentally different from `readline` prompts — the human responds
asynchronously from any terminal.

### 3. Orchestrator coupled to daemon

The orchestrator starts when the daemon starts and stops when it stops. There is no separate
orchestrator process. The daemon's event bus is the orchestrator's nervous system — all
state transitions are both driven by and emitted to the bus.

### 4. Claude Code hooks are defense-in-depth

The primary enforcement is the state machine itself — it won't advance without preconditions.
Hooks are a secondary layer that catch coding agents attempting to bypass the process (e.g.,
committing without review). The `telesis preflight` command checks:

- Milestone entry exists in MILESTONES.md
- Review has converged (or orchestrator state is past REVIEWING)
- Quality gates have passed
- No pending blocking decisions

### 5. Serial execution only

Work items within a milestone execute one at a time. The orchestrator tracks
`currentTaskIndex` and advances sequentially. Parallelism is a future milestone — the state
machine design doesn't preclude it, but the v0.22.0 runner is sequential.

### 6. Review convergence is automated

The REVIEWING state is a self-contained loop:

```
stage changes → review → findings?
  → yes, high/critical: dispatch fix task → re-stage → review again
  → yes, converging (new + persistent ≤ 3, severity ≤ medium): converged → advance
  → no convergence after N rounds: escalate to human
```

The coding agent receives "fix these specific findings" as a task. It doesn't know it's in
a review loop. The orchestrator manages the loop.

### 7. Persistence mirrors PipelineState pattern

The existing `src/pipeline/state.ts` persists pipeline state for resumability. The
orchestrator uses the same pattern: atomic JSON write to `.telesis/orchestrator.json`,
loaded on daemon startup. All in-flight state (current milestone, task index, review round)
is recoverable.

---

## CLI Interface

### `telesis orchestrator status`

Shows current orchestrator state:

```
Orchestrator: reviewing (round 3)
Milestone:    v0.22.0 — Orchestrator Walking Skeleton
Progress:     8/10 tasks complete
Review:       round 3, 2 findings remaining (converging)
Decisions:    1 pending

Pending decisions:
  [abc123] criteria_confirmation — "Confirm AC #14: walking skeleton end-to-end test"
```

### `telesis orchestrator approve <decision-id>`

Resolves a pending decision as approved.

### `telesis orchestrator reject <decision-id> --reason "..."`

Resolves a pending decision as rejected with a reason. The orchestrator uses the reason
to adjust (e.g., rejected plan → re-plan with feedback).

### `telesis preflight`

Run by Claude Code hooks before git commit/push. Returns pass/fail with details:

```
Preflight: FAIL
  ✗ Review convergence: not yet converged (round 1, 5 high findings)
  ✓ Quality gates: passed
  ✓ Milestone entry: exists
  ✗ Pending decisions: 1 blocking decision awaiting response
```

Exit code 1 on failure (blocks the hook).

---

## OS Notifications

macOS notifications via `osascript`:

```typescript
const notify = (title: string, message: string): void => {
  try {
    execFileSync("osascript", [
      "-e",
      `display notification "${message}" with title "Telesis" subtitle "${title}"`,
    ]);
  } catch {
    // best-effort — don't crash if notifications unavailable
  }
};
```

Notification triggers:

| State transition | Notification |
|-----------------|--------------|
| → triage (new items) | "New work items ready for triage" |
| decision created | "Decision needed: <summary>" |
| → executing | "Milestone <name>: execution started" |
| task escalated | "Task escalated — human input needed" |
| → milestone_check | "Milestone <name>: ready for final check" |
| → done | "Milestone <name> shipped!" |

---

## Event Types

New event source: `"orchestrator"`

| Event Type | Payload |
|------------|---------|
| `orchestrator:state_changed` | `OrchestratorStatePayload` |
| `orchestrator:decision_created` | `OrchestratorDecisionPayload` |
| `orchestrator:decision_resolved` | `OrchestratorDecisionPayload` |
| `orchestrator:judgment_called` | `OrchestratorJudgmentPayload` |
| `orchestrator:error` | `{ error: string; state: OrchestratorState }` |

---

## Test Strategy

- **State machine unit tests:** Test every transition, every precondition enforcement,
  every rejection of invalid transitions. This is the most critical test surface.
- **Decision queue tests:** Create, list, resolve, persistence round-trip.
- **Persistence tests:** Save/load orchestrator context, crash recovery simulation.
- **Judgment tests:** Mock ModelClient, verify prompt construction and response parsing
  for triage and TDD-necessity calls.
- **Convergence loop tests:** Mock review pipeline, simulate multi-round convergence
  scenarios (immediate convergence, gradual convergence, failure to converge).
- **Preflight tests:** Various orchestrator states → preflight pass/fail.
- **CLI tests:** Status formatting, approve/reject commands with temp directories.
- **Notification tests:** Verify `osascript` is called with correct arguments (mock
  `execFileSync`).
- **All tests use temp directories.** No live daemon, no live LLM calls, no real git repos.
- **Integration test:** Full lifecycle with mocked dispatch/review. Work item → DONE
  transition with all intermediate states verified.
