# TDD-019 — Daemon Session Lifecycle

**Status:** Accepted
**Date:** 2026-03-25
**Author:** Delightful Hammers
**Related:** v0.29.0 milestone, TDD-016 (Orchestrator), TDD-018 (Multi-Session Orchestrator)

---

## Overview

The daemon currently holds the orchestrator state and exposes it via the event bus, but does
not react to events. The `integration.ts` subscription has an explicit placeholder:
`// Future: react to dispatch:session:completed`. This TDD fills that gap.

The dispatcher and `AgentAdapter` (acpx) already handle the hard problems: session creation,
agent invocation, NDJSON event streaming, subprocess cleanup, and status tracking. Session
metadata is persisted to `.telesis/dispatch/`. The daemon's job is to **react to dispatch
lifecycle events** and drive the orchestrator forward — persisting exit state, generating
resume briefings, and applying a configurable restart policy.

### What this TDD addresses

- Daemon subscription to `dispatch:session:completed` and `dispatch:session:failed` events
- Exit reason mapping from dispatch status to orchestrator session fields
- Resume briefing generation on session end
- Configurable restart policy: auto-restart, notify-only, manual
- Cooldown and circuit breaker for auto-restart
- Config schema for restart policy
- Status command extension for dispatch session history

### What this TDD does not address (scope boundary)

- Provider-neutral enforcement (v0.30.0)
- New agent adapter implementations
- Context window token counting
- Daemon-initiated agent spawning for non-dispatch use cases (e.g., review)

---

## Architecture

```
                    Dispatcher
                        │
           dispatch:session:completed
           dispatch:session:failed
                        │
                        ▼
                   Event Bus (RxJS)
                        │
                        ▼
            ┌───────────────────────┐
            │  Session Reactor      │
            │  (new: src/daemon/    │
            │   session-reactor.ts) │
            │                       │
            │  1. Map exit reason   │
            │  2. Update context    │
            │  3. Generate briefing │
            │  4. Apply policy      │
            │     └─ auto-restart:  │
            │        advance()      │
            │     └─ notify-only:   │
            │        OS notify      │
            │     └─ manual:        │
            │        (no action)    │
            └───────────────────────┘
```

### Modified packages

| Package | Change |
|---------|--------|
| `src/daemon/session-reactor.ts` | **New** — event handler for dispatch session lifecycle |
| `src/daemon/types.ts` | No changes — event types already exist |
| `src/orchestrator/integration.ts` | Wire session reactor into bus subscription |
| `src/config/config.ts` | Add `RestartPolicy` to `DaemonConfig` |
| `src/cli/orchestrator.ts` | Extend status to show dispatch session history |
| `src/mcp/tools/orchestrator.ts` | Include session history in status tool response |

### New files

| File | Purpose |
|------|---------|
| `src/daemon/session-reactor.ts` | Session lifecycle reactor: exit mapping, briefing, restart policy |
| `src/daemon/session-reactor.test.ts` | Unit tests for reactor logic |

---

## Types

### Restart policy configuration

```typescript
export type RestartPolicy = "auto-restart" | "notify-only" | "manual";

export interface SessionLifecycleConfig {
  /** What to do when a dispatched session ends. Default: "notify-only" */
  readonly restartPolicy?: RestartPolicy;
  /** Minimum seconds between auto-restarts. Default: 30 */
  readonly cooldownSeconds?: number;
  /** Max auto-restarts per milestone before circuit-breaking. Default: 10 */
  readonly maxRestartsPerMilestone?: number;
}
```

Added to `DaemonConfig`:

```typescript
export interface DaemonConfig {
  readonly watch?: { readonly ignore?: readonly string[] };
  readonly heartbeatIntervalMs?: number;
  readonly sessionLifecycle?: SessionLifecycleConfig;
}
```

Config YAML example:

```yaml
daemon:
  sessionLifecycle:
    restartPolicy: auto-restart
    cooldownSeconds: 30
    maxRestartsPerMilestone: 10
```

### Session reactor state (in-memory, not persisted)

```typescript
interface ReactorState {
  /** Restart count for the current milestone (reset on milestone transition) */
  restartCount: number;
  /** Timestamp of last restart (for cooldown enforcement) */
  lastRestartAt?: number;
  /** Current milestone ID (to detect milestone transitions) */
  milestoneId?: string;
}
```

---

## Key Design Decisions

### 1. The reactor is a pure function + state, not a class

The session reactor is a factory function that returns a bus event handler. It closes over
reactor state and dependencies. This matches the existing daemon patterns (heartbeat timer,
filesystem watcher) — functional composition, not OOP.

```typescript
export const createSessionReactor = (deps: SessionReactorDeps): EventHandler
```

### 2. Exit reason mapping is deterministic, not LLM-powered

Dispatch results map to orchestrator session exit reasons via simple rules:

| Dispatch event | Error content | Exit reason |
|----------------|---------------|-------------|
| `dispatch:session:completed` | — | `clean` |
| `dispatch:session:failed` | contains "hook" or "preflight" | `hook_block` |
| `dispatch:session:failed` | contains "context" or "token" | `context_full` |
| `dispatch:session:failed` | anything else | `error` |

No LLM call needed. If the heuristic is wrong, the resume briefing still has the raw error
available for the human or next session to inspect.

### 3. Auto-restart calls advance(), not dispatch() directly

The reactor doesn't re-dispatch itself. It calls the orchestrator's `advance()` function,
which determines the next step. If the orchestrator is in `executing` state and the session
failed, `advance()` will create an escalation decision and wait. If the session completed
and all tasks are done, `advance()` will transition to `post_task`. The reactor trusts the
state machine to decide what happens next.

This is critical: the reactor is a trigger, not a controller. The orchestrator owns the
lifecycle logic.

### 4. Cooldown is wall-clock, not event-count

The cooldown timer uses `Date.now()` comparison, not "N events since last restart." This is
simpler and prevents a pathological case where rapid failures with few events could bypass
a count-based cooldown.

### 5. Circuit breaker is per-milestone

The `maxRestartsPerMilestone` counter resets when the orchestrator transitions to a new
milestone (detected by comparing `milestoneId` in context). This prevents a bad milestone
from consuming infinite restarts while allowing a fresh milestone to start clean.

### 6. Notify-only is the default

Auto-restart is powerful but risky — a misconfigured agent could loop forever consuming
tokens. The safe default is `notify-only`: the daemon persists exit state and sends an OS
notification, but waits for the human (or an MCP tool call) to advance. Users opt into
auto-restart explicitly.

---

## Integration Points

### integration.ts — wiring the reactor

The existing placeholder subscription becomes the reactor:

```typescript
export const startOrchestrator = (
  rootDir: string,
  bus: EventBus,
  config: DaemonConfig,
): OrchestratorHandle => {
  let ctx = loadContext(rootDir) ?? createContext();
  saveContext(rootDir, ctx);

  const reactor = createSessionReactor({
    rootDir,
    bus,
    config: config.sessionLifecycle ?? {},
    loadContext: () => loadContext(rootDir),
    saveContext: (c) => saveContext(rootDir, c),
    generateBriefing: () => generateResumeBriefing(/* deps */),
    advance: (c, deps) => advance(c, deps),
    buildRunnerDeps: () => buildRunnerDeps(rootDir, bus, client),
    notify: (title, body) => sendNotification(title, body),
  });

  const subscription = bus.subscribe(reactor);

  return {
    getContext: () => loadContext(rootDir) ?? ctx,
    _unsubscribe: () => subscription.unsubscribe(),
    _rootDir: rootDir,
  };
};
```

### Session reactor — event handler

```typescript
export interface SessionReactorDeps {
  readonly rootDir: string;
  readonly config: SessionLifecycleConfig;
  readonly loadContext: () => OrchestratorContext | null;
  readonly saveContext: (ctx: OrchestratorContext) => void;
  readonly advance: (ctx: OrchestratorContext, deps: RunnerDeps) => Promise<AdvanceResult>;
  readonly buildRunnerDeps: () => RunnerDeps;
  readonly notify: (title: string, body: string) => void;
}

export const createSessionReactor = (
  deps: SessionReactorDeps,
): ((event: TelesisDaemonEvent) => void) => {
  const state: ReactorState = { restartCount: 0 };

  return (event: TelesisDaemonEvent) => {
    if (
      event.type !== "dispatch:session:completed" &&
      event.type !== "dispatch:session:failed"
    ) {
      return; // Not a dispatch lifecycle event — ignore
    }

    const ctx = deps.loadContext();
    if (!ctx || ctx.state === "idle") return;

    // Step 1: Map exit reason
    const exitReason = mapExitReason(event);

    // Step 2: Update orchestrator context
    const updatedCtx = {
      ...ctx,
      sessionEndedAt: new Date().toISOString(),
      sessionExitReason: exitReason,
      updatedAt: new Date().toISOString(),
    };
    deps.saveContext(updatedCtx);

    // Step 3: Detect milestone transition (reset circuit breaker)
    if (ctx.milestoneId !== state.milestoneId) {
      state.restartCount = 0;
      state.milestoneId = ctx.milestoneId;
    }

    // Step 4: Apply restart policy
    const policy = deps.config.restartPolicy ?? "notify-only";
    applyPolicy(policy, updatedCtx, deps, state);
  };
};
```

### Exit reason mapper

```typescript
const mapExitReason = (event: TelesisDaemonEvent): SessionExitReason => {
  if (event.type === "dispatch:session:completed") return "clean";

  // dispatch:session:failed — inspect error for classification
  const error = (event.payload as DispatchSessionFailedPayload).error.toLowerCase();
  if (error.includes("hook") || error.includes("preflight")) return "hook_block";
  if (error.includes("context") || error.includes("token")) return "context_full";
  return "error";
};
```

### Policy application

```typescript
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
      `Orchestrator in ${ctx.state}, exit: ${ctx.sessionExitReason}. Run 'telesis orchestrator run' to continue.`,
    );
    return;
  }

  // auto-restart
  if (state.restartCount >= maxRestarts) {
    deps.notify(
      "Circuit breaker tripped",
      `${state.restartCount} restarts for milestone ${ctx.milestoneId}. Manual intervention required.`,
    );
    return;
  }

  const now = Date.now();
  if (state.lastRestartAt && now - state.lastRestartAt < cooldownMs) {
    deps.notify(
      "Cooldown active",
      `Waiting ${cooldownMs / 1000}s between restarts. Will auto-restart after cooldown.`,
    );
    // Schedule restart after cooldown
    setTimeout(() => {
      state.restartCount++;
      state.lastRestartAt = Date.now();
      const freshCtx = deps.loadContext();
      if (freshCtx) {
        deps.advance(freshCtx, deps.buildRunnerDeps());
      }
    }, cooldownMs - (now - state.lastRestartAt));
    return;
  }

  state.restartCount++;
  state.lastRestartAt = now;
  deps.advance(ctx, deps.buildRunnerDeps());
};
```

---

## Status command extension

### CLI: `telesis orchestrator status`

Extend to show dispatch session history for the current milestone:

```
Session History (current milestone):
  1. ses-abc12 [completed] 2026-03-25T14:00Z → 14:32Z (32m, 847 events)
  2. ses-def34 [failed]    2026-03-25T14:35Z → 14:41Z (6m, hook_block)
  3. ses-ghi56 [running]   2026-03-25T14:42Z → ...
```

Data source: `.telesis/dispatch/` session metadata, filtered by milestone timeframe.

### MCP: `telesis_orchestrator_status`

Add `sessionHistory` array to the existing status response:

```json
{
  "state": "executing",
  "sessionHistory": [
    { "id": "ses-abc12", "status": "completed", "startedAt": "...", "completedAt": "...", "eventCount": 847 },
    { "id": "ses-def34", "status": "failed", "startedAt": "...", "completedAt": "...", "error": "preflight blocked" }
  ]
}
```

---

## Test Strategy

- **Exit reason mapping tests:** All dispatch event × error content combinations produce the
  correct `SessionExitReason`. Cover the keyword heuristics and fallback.
- **Reactor unit tests:** Mock deps, fire dispatch events, verify:
  - Context is updated with correct exit reason and timestamps
  - Correct policy action is taken (notify, advance, or nothing)
  - Circuit breaker trips at `maxRestartsPerMilestone`
  - Cooldown prevents rapid restarts
  - Milestone transition resets restart count
- **Reactor ignores non-dispatch events:** Fire heartbeat, filesystem, and orchestrator events
  — reactor should not react.
- **Reactor handles idle orchestrator:** Fire dispatch event when orchestrator is idle — should
  be a no-op.
- **Config parsing tests:** Verify `sessionLifecycle` section is parsed correctly from YAML,
  including defaults and edge cases.
- **Integration test:** Wire reactor to a real bus, fire a dispatch event, verify orchestrator
  context is updated. No live daemon or agent needed.
- **All tests use mocked deps and temp directories.** No live daemon, no live LLM calls.
