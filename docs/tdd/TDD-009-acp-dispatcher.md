# TDD-009 — ACP Dispatcher

**Status:** Accepted
**Date:** 2026-03-12
**Author:** Delightful Hammers
**Related:** v0.13.0 milestone

---

## Overview

Telesis has a daemon foundation (v0.12.0) with an RxJS event bus, filesystem watcher, Unix
socket IPC, and OS supervision. The daemon observes — but cannot act. The ACP Dispatcher
adds the ability to dispatch coding agents via ACP (Agent Client Protocol), turning Telesis
from a passive observer into an active work executor.

The dispatcher uses `acpx` (npm: acpx) as a subprocess to manage agent sessions. acpx is a
headless CLI client for ACP that handles agent registry (claude, codex, gemini, cursor,
copilot, etc.), session management, prompt queueing, crash recovery, and NDJSON event
streaming. By wrapping acpx behind a clean adapter interface, Telesis gets agent-agnostic
dispatch immediately while retaining the ability to swap to direct ACP SDK usage later.

Dispatch runs in the CLI process, not the daemon. The daemon is an event backbone. If the
daemon is running, the CLI publishes dispatch events to it for TUI streaming and specialist
agent observation. This avoids extending the socket protocol with complex command payloads.

All new dispatch code lives under `src/dispatch`.

### What this TDD addresses

- acpx adapter interface and subprocess implementation
- Context assembly for agent consumption
- Session persistence (meta + event JSONL)
- Daemon event integration (dispatch:* event types)
- Bounded concurrency for parallel agent sessions
- CLI commands (dispatch run, list, show)
- TUI display of dispatch events

### What this TDD does not address (scope boundary)

- Active oversight agents observing dispatch streams (v0.14.0)
- Multi-agent coordination strategies (v0.14.0+)
- Agent permission escalation
- acpx internals or patching
- Event persistence to JSONL for daemon events (only dispatch session events are persisted)
- Work intake from external sources (v0.15.0)

---

## Architecture

### Dispatch flow

```
┌──────────────────────────────────────────────────────────────┐
│                      CLI Process                              │
│                                                              │
│  telesis dispatch run "task"                                  │
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐  │
│  │  Dispatcher  │────▶│   Context    │────▶│   Adapter    │  │
│  │              │     │  Assembler   │     │  (acpx)      │  │
│  │  - session   │     │              │     │              │  │
│  │  - concurr.  │     │  .telesis/   │     │  spawn acpx  │  │
│  │  - events    │     │  docs/       │     │  read NDJSON │  │
│  └──────┬───────┘     └──────────────┘     └──────┬───────┘  │
│         │                                         │          │
│         │ store events                   NDJSON   │          │
│         ▼                                events   │          │
│  ┌─────────────┐                                  │          │
│  │   Session    │◀────────────────────────────────┘          │
│  │   Store      │                                            │
│  │  .telesis/   │                                            │
│  │  sessions/   │                                            │
│  └─────────────┘                                             │
│         │                                                    │
│         │ if daemon running                                  │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │  Daemon Bus  │  dispatch:* events → TUI, future agents    │
│  └─────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### Adapter interface

The `AgentAdapter` interface abstracts acpx subprocess management. All acpx subprocess
spawning is contained in a single file (`src/dispatch/acpx-adapter.ts`), following the
same containment pattern as `src/agent/model/client.ts` (Anthropic SDK) and
`src/daemon/bus.ts` (rxjs).

```typescript
export interface AgentAdapter {
  readonly createSession: (agent: string, name: string, cwd: string) => Promise<string>;
  readonly prompt: (
    agent: string,
    sessionName: string,
    text: string,
    cwd: string,
    onEvent: (event: AgentEvent) => void,
  ) => Promise<void>;
  readonly cancel: (agent: string, sessionName: string, cwd: string) => Promise<void>;
  readonly closeSession: (agent: string, name: string, cwd: string) => Promise<void>;
}
```

### Dispatch event types

The daemon event union is extended with a `"dispatch"` source and seven new event types:

```typescript
type EventSource = "daemon" | "filesystem" | "socket" | "dispatch";

// New event types
| "dispatch:session:started"
| "dispatch:session:completed"
| "dispatch:session:failed"
| "dispatch:agent:thinking"
| "dispatch:agent:tool_call"
| "dispatch:agent:output"
| "dispatch:agent:cancelled"
```

Payloads:

```typescript
interface DispatchSessionPayload {
  readonly sessionId: string;
  readonly agent: string;
  readonly task: string;
}

interface DispatchSessionCompletedPayload extends DispatchSessionPayload {
  readonly durationMs: number;
  readonly eventCount: number;
}

interface DispatchSessionFailedPayload extends DispatchSessionPayload {
  readonly error: string;
}

interface DispatchAgentEventPayload {
  readonly sessionId: string;
  readonly agent: string;
  readonly seq: number;
  readonly data: Record<string, unknown>;
}
```

### Dispatch types

```typescript
export type AgentName = string;

export type SessionStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentEvent {
  readonly eventVersion: number;
  readonly sessionId: string;
  readonly requestId: string;
  readonly seq: number;
  readonly stream: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface SessionMeta {
  readonly id: string;
  readonly agent: string;
  readonly task: string;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly eventCount: number;
}
```

### Session persistence

```
.telesis/sessions/
  <session-id>.meta.json     — SessionMeta (random-access updates)
  <session-id>.events.jsonl  — append-only AgentEvent stream
```

Meta and events are separated because meta needs random-access updates (status changes)
while events are append-only and can be large. This avoids rewriting the entire file to
update session status.

### Dispatch configuration

```typescript
interface DispatchConfig {
  readonly defaultAgent?: string;
  readonly maxConcurrent?: number;  // default: 3
  readonly acpxPath?: string;       // default: "acpx"
}
```

Parsed from `.telesis/config.yml` under the `dispatch` key, following the same pattern
as `parseDaemonConfig()`.

---

## Integration points

| Module | Status | Description |
|--------|--------|-------------|
| `src/dispatch/types.ts` | NEW | AgentEvent, SessionMeta, SessionStatus types |
| `src/dispatch/adapter.ts` | NEW | AgentAdapter interface definition |
| `src/dispatch/acpx-adapter.ts` | NEW | acpx subprocess implementation (sole acpx spawner) |
| `src/dispatch/store.ts` | NEW | Session persistence (.meta.json + .events.jsonl) |
| `src/dispatch/context.ts` | NEW | Project context assembly for agents |
| `src/dispatch/dispatcher.ts` | NEW | Orchestration: context + adapter + store + events |
| `src/dispatch/format.ts` | NEW | CLI output formatting for list/show |
| `src/cli/dispatch.ts` | NEW | Commander subcommands (run, list, show) |
| `src/daemon/types.ts` | MODIFIED | Add "dispatch" source, 7 new event types, payloads |
| `src/daemon/tui.ts` | MODIFIED | Add formatting for dispatch:* events |
| `src/config/config.ts` | MODIFIED | Add DispatchConfig parsing |
| `src/index.ts` | MODIFIED | Register dispatch command |
| `src/drift/checks/acpx-import.ts` | NEW | Containment: acpx spawning only in acpx-adapter.ts |
| `src/drift/checks/index.ts` | MODIFIED | Register acpx containment check |

---

## Testing strategy

| Module | Test approach |
|--------|--------------|
| `acpx-adapter.ts` | Unit: mock Bun.spawn, feed canned NDJSON, test event parsing, error handling, acpx-not-found |
| `store.ts` | Unit: create/update/load sessions, append events, list sessions, ID prefix matching |
| `context.ts` | Unit: context assembly from fixture project, section extraction, missing docs |
| `dispatcher.ts` | Unit: FakeAgentAdapter, verify session persistence, event translation, concurrency enforcement, error handling |
| `format.ts` | Unit: list formatting, show formatting, JSON output |
| `tui.ts` (additions) | Unit: dispatch:* event formatting, colors |
| `acpx-import.ts` | Unit: detection of acpx/Bun.spawn usage outside acpx-adapter.ts |

All tests use `useTempDir()` for filesystem operations.

---

## Decisions

1. **acpx as subprocess, not ACP SDK directly.** acpx handles agent registry, session
   management, crash recovery, and NDJSON event streaming out of the box. Building this
   from scratch against the raw ACP SDK would delay v0.13.0 significantly. The adapter
   interface means we can swap to direct SDK usage later without changing the dispatcher.

2. **Dispatch in CLI process, not daemon.** The daemon is an event backbone — it observes
   and distributes events. Making it dispatch agents would require extending the socket
   protocol with complex command payloads (task text, config, streaming responses). Instead,
   the CLI process runs the dispatch and publishes events to the daemon if it's running.
   This keeps both the daemon and the dispatcher simple.

3. **Separate meta.json and events.jsonl per session.** Unlike the journal (single JSONL),
   dispatch sessions need both random-access status updates (meta) and append-only event
   streaming (events). A single JSONL file would require rewriting the entire file to
   update session status. The two-file approach handles both access patterns cleanly.

4. **Module-level concurrency tracking via Set<string>.** Active session IDs are tracked
   in a module-level Set rather than a separate state file. This is simpler and sufficient
   because dispatch runs in a single CLI process. Cross-process concurrency (multiple
   terminal windows) is out of scope for v0.13.0.

5. **Context assembly duplicates helpers from review context.** The `readFileSafe` and
   `extractSection` helpers are duplicated from `src/agent/review/context.ts` rather than
   refactored into a shared module. Premature extraction risks coupling the review and
   dispatch contexts. A shared extraction module is tracked as a follow-up.
