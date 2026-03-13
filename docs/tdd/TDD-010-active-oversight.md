# TDD-010 — Active Oversight & Chronicler

**Status:** Accepted
**Date:** 2026-03-13
**Author:** Delightful Hammers
**Related:** v0.14.0 milestone

---

## Overview

Telesis v0.13.0 added the ACP Dispatcher — coding agents can be spawned via
`telesis dispatch run`, their events streamed through the daemon bus, and their sessions
persisted as NDJSON. The dispatcher works, but nobody watches.

v0.14.0 adds **observer agents** that monitor coding sessions in real time:
- **Reviewer** — flags code quality issues as the coding agent works
- **Architect** — detects spec drift during coding sessions
- **Chronicler** — extracts development insights from completed sessions as automatic notes

Observers are non-blocking event consumers that buffer events synchronously and run
analysis as background promises at configurable checkpoints. They produce findings (reviewer,
architect) or notes (chronicler) that flow back through the daemon event backbone.

All new oversight code lives under `src/oversight/`.

### What this TDD addresses

- Observer framework (event buffering, periodic analysis, drain)
- Policy file format and parsing (`.telesis/agents/<name>.md`)
- Reviewer observer (code quality monitoring)
- Architect observer (spec drift detection)
- Chronicler (post-session insight extraction)
- Daemon event types for oversight (`oversight:*`)
- CLI integration with dispatch
- TUI rendering for oversight events

### What this TDD does not address (scope boundary)

- Observer-to-observer communication
- Custom user-defined observer types beyond the three built-in ones
- Observer persistence beyond notes
- Multi-agent coordination
- Policy hot-reload during sessions
- Dedicated `telesis oversight` CLI command
- Observer history or session-level finding persistence

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      CLI Process                              │
│                                                              │
│  telesis dispatch run "task" --agent claude                    │
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐  │
│  │  Dispatcher  │────▶│  Event Fan   │────▶│   Renderer   │  │
│  │              │     │  Out         │     │   (TUI)      │  │
│  │  dispatch()  │     │              │     └──────────────┘  │
│  └──────────────┘     │              │                       │
│                       │              │     ┌──────────────┐  │
│                       │              │────▶│  Oversight    │  │
│                       └──────────────┘     │  Orchestrator │  │
│                                            │              │  │
│                        oversight:*         │  Reviewer    │  │
│                        events back         │  Architect   │  │
│                       ◀────────────────────│  Chronicler  │  │
│                                            └──────┬───────┘  │
│                                                   │          │
│                                            ModelClient calls │
│                                            (async, non-block)│
│                                                              │
│  After dispatch():                                           │
│    orchestrator.drain() → final analysis + chronicler notes  │
└──────────────────────────────────────────────────────────────┘
```

**Key decisions:**

1. **Observers run in the CLI process, not the daemon.** The daemon is a pure event router
   (consistent with v0.12.0 design). The CLI already has the event stream via `onEvent`.
   Adding model calls to the daemon would violate containment and make it heavyweight.

2. **Non-blocking event processing.** `receive()` is synchronous — buffer + trigger check.
   Analysis runs as detached promises. `drain()` awaits all pending promises. This ensures
   the dispatch event flow is never blocked by model call latency.

3. **Built-in defaults, policy file overrides.** Like review personas, observers work with
   built-in definitions. Policy files customize behavior. No policy files → no observers
   (cost control). Users opt in explicitly.

4. **Chronicler is post-session only.** Running the chronicler in real time adds cost with
   little benefit — it needs the full session to identify patterns. The `on-complete`
   trigger fires once in `drain()` after the session ends.

---

## Types

```typescript
// src/oversight/types.ts

export type AutonomyLevel = "observe" | "alert" | "intervene";
export type TriggerMode = "periodic" | "on-output" | "on-complete";

export interface PolicyFile {
  readonly name: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly autonomy: AutonomyLevel;
  readonly trigger: TriggerMode;
  readonly intervalEvents: number;
  readonly model: string;
  readonly systemPrompt: string;
}

export interface OversightFinding {
  readonly id: string;
  readonly observer: string;
  readonly sessionId: string;
  readonly severity: "info" | "warning" | "critical";
  readonly summary: string;
  readonly detail: string;
  readonly eventRange: { readonly from: number; readonly to: number };
}

export interface ChroniclerNote {
  readonly text: string;
  readonly tags: readonly string[];
}

export interface ObserverOutput {
  readonly findings: readonly OversightFinding[];
  readonly notes: readonly ChroniclerNote[];
  readonly intervention?: { readonly reason: string };
}

export type AnalyzeFn = (
  events: readonly TelesisDaemonEvent[],
  context: DispatchContext,
) => Promise<ObserverOutput>;

export interface Observer {
  readonly name: string;
  readonly policy: PolicyFile;
  readonly receive: (event: TelesisDaemonEvent) => void;
  readonly drain: () => Promise<ObserverOutput>;
}
```

---

## Policy File Format

Policy files live at `.telesis/agents/<name>.md`. YAML frontmatter holds operational
config; the markdown body becomes the system prompt preamble.

```markdown
---
name: reviewer
version: 1
enabled: true
autonomy: alert
trigger: periodic
intervalEvents: 10
model: claude-sonnet-4-6
---

## Role
You are the Reviewer observer monitoring a coding agent session in real time.
[... system prompt ...]
```

**Frontmatter fields with defaults:**
- `name` — required
- `version` — default: 1
- `enabled` — default: false (cost control — user opts in)
- `autonomy` — default: alert
- `trigger` — default: periodic (reviewer/architect), on-complete (chronicler)
- `intervalEvents` — default: 10
- `model` — default: claude-sonnet-4-6

---

## Daemon Event Types

```typescript
// Extend EventSource
type EventSource = "daemon" | "filesystem" | "socket" | "dispatch" | "oversight";

// New event types
| "oversight:finding"
| "oversight:note"
| "oversight:intervention"

// Payloads
interface OversightFindingPayload {
  readonly sessionId: string;
  readonly observer: string;
  readonly severity: string;
  readonly summary: string;
}

interface OversightNotePayload {
  readonly sessionId: string;
  readonly text: string;
  readonly tags: readonly string[];
}

interface OversightInterventionPayload {
  readonly sessionId: string;
  readonly observer: string;
  readonly reason: string;
}
```

---

## Intervention Mechanism

When an observer at `intervene` autonomy produces a critical finding:
1. Orchestrator calls `requestCancel(reason)` callback
2. CLI layer calls `adapter.cancel(agent, sessionId, cwd)`
3. Agent session ends, `dispatch()` resolves with `"cancelled"` status
4. Intervention reason printed to terminal

The `requestCancel` callback is injected into the orchestrator from the CLI layer.

---

## Orchestrator

```typescript
interface OversightDeps {
  readonly rootDir: string;
  readonly sessionId: string;
  readonly modelClient: ModelClient;
  readonly onEvent: (event: TelesisDaemonEvent) => void;
  readonly requestCancel?: () => Promise<void>;
}

interface OversightOrchestrator {
  readonly receive: (event: TelesisDaemonEvent) => void;
  readonly drain: () => Promise<OversightSummary>;
}

interface OversightSummary {
  readonly findingCount: number;
  readonly noteCount: number;
  readonly intervened: boolean;
}
```

- Loads enabled policies from `.telesis/agents/`
- Creates observers via `createObserver()` with appropriate analyzer
- `receive(event)` fans out to all observers
- Autonomy-level routing on findings:
  - `observe`: log to session, don't emit event
  - `alert`: emit `oversight:finding` event via `onEvent`
  - `intervene`: emit event + call `requestCancel`
- `drain()` calls `drain()` on all observers, writes chronicler notes, returns summary

---

## Event Digest Format

Buffered events are formatted as a digest capped at ~8k characters for model input.
Most recent events are prioritized. Tool call names and output snippets are included;
full output is excluded to manage token budget.

---

## Package Structure

```
src/oversight/
  types.ts              — Observer, PolicyFile, OversightFinding, AutonomyLevel types
  policy.ts             — Parse .telesis/agents/<name>.md (frontmatter + body)
  policy.test.ts
  observer.ts           — Generic observer: buffering, periodic analysis, drain
  observer.test.ts
  prompts.ts            — System prompts for reviewer, architect, chronicler
  prompts.test.ts
  reviewer.ts           — Reviewer analyzer: code quality findings
  reviewer.test.ts
  architect.ts          — Architect analyzer: spec drift detection
  architect.test.ts
  chronicler.ts         — Post-session note extraction
  chronicler.test.ts
  orchestrator.ts       — Wire observers to dispatch event stream
  orchestrator.test.ts
  format.ts             — Event digest formatting for model input
  format.test.ts
```

---

## Existing Code Reused

| What | Where |
|------|-------|
| `assembleDispatchContext()` | `src/dispatch/context.ts` |
| `formatContextPrompt()` | `src/dispatch/context.ts` |
| `createModelClient()` | `src/agent/model/client.ts` |
| `createTelemetryLogger()` | `src/agent/telemetry/logger.ts` |
| `appendNote()` | `src/notes/store.ts` |
| `createEvent()` | `src/daemon/types.ts` |
| `createEventRenderer()` | `src/daemon/tui.ts` |
| `handleAction()` | `src/cli/handle-action.ts` |
| `parseDispatchConfig()` | `src/config/config.ts` |
| `useTempDir()` | `src/test-utils.ts` |
| `js-yaml` | Already a dependency |
