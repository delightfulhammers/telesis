# TDD-008 — Daemon Foundation

**Status:** Accepted
**Date:** 2026-03-12
**Author:** Delightful Hammers
**Related:** v0.12.0 milestone

---

## Overview

Telesis has been a collection of stateless CLI commands — each invocation starts fresh,
does its work, and exits. This is sufficient for human-invoked operations (review, drift,
journal) but insufficient for the next phase: reactive agent orchestration. Agents need
to observe development events in real time and respond without human invocation.

The daemon foundation introduces a long-running process that watches the project filesystem,
maintains a typed event backbone, and exposes a Unix socket for IPC. It transforms Telesis
from "run a command, get a result" to "always watching, always aware." The daemon is the
substrate on which all future agent orchestration (ACP dispatcher, oversight agents,
chronicler) will run.

This is the right time to build the daemon because the CLI agent capabilities are mature
enough to be worth automating (review, drift, milestone validation) and the journal entries
from 2026-03-12 have crystallized the architectural decisions: monolithic binary with
in-process events, RxJS for the event backbone, Unix socket for IPC, and OS-level
supervision via LaunchAgent/systemd.

### What this TDD addresses

- Daemon lifecycle management (start/stop/status/install)
- RxJS event backbone with typed discriminated union events
- Filesystem watcher emitting events to the bus
- Unix socket IPC with NDJSON protocol
- OS supervision generation (LaunchAgent, systemd)
- Minimal TUI client for event streaming
- PID file management

### What this TDD does not address (scope boundary)

- ACP dispatcher (v0.13.0)
- Agent orchestration / specialist agents reacting to events (v0.13.0+)
- Event persistence to JSONL (v0.13.0)
- TUI interactivity / framework (v0.13.0+)
- Multi-project daemon
- Windows support
- Config hot-reload
- Event filtering/query on subscribe
- Socket authentication

---

## Architecture

### Daemon internals

```
┌─────────────────────────────────────────────────────────┐
│                    Daemon Process                        │
│                                                         │
│  ┌─────────────┐    publish    ┌──────────────────┐     │
│  │  Filesystem  │─────────────▶│                  │     │
│  │   Watcher    │              │   RxJS Event Bus │     │
│  └─────────────┘              │   (Subject<T>)   │     │
│                                │                  │     │
│  ┌─────────────┐    publish    │                  │     │
│  │  Heartbeat   │─────────────▶│                  │     │
│  │   Timer      │              └────────┬─────────┘     │
│  └─────────────┘                        │               │
│                                         │ subscribe     │
│                                         ▼               │
│  ┌─────────────────────────────────────────────────┐    │
│  │             Unix Socket Server                   │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │    │
│  │  │Client 1 │  │Client 2 │  │Client N │         │    │
│  │  │(TUI)    │  │(CLI)    │  │(future) │         │    │
│  │  └─────────┘  └─────────┘  └─────────┘         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────┐                                        │
│  │  PID File    │  .telesis/daemon.pid                   │
│  └─────────────┘                                        │
│  ┌─────────────┐                                        │
│  │  Socket File │  .telesis/daemon.sock                  │
│  └─────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

### Event type system

All events use a discriminated union with a `BaseEvent` shape. The `type` field is the
discriminant, namespaced by source (`daemon:`, `fs:`, `socket:`).

```typescript
/** Event source categories */
type EventSource = "daemon" | "filesystem" | "socket";

/** All event type literals */
type EventType =
  | "daemon:started"
  | "daemon:stopping"
  | "daemon:stopped"
  | "daemon:heartbeat"
  | "fs:file:created"
  | "fs:file:modified"
  | "fs:file:deleted"
  | "fs:dir:created"
  | "fs:dir:deleted"
  | "socket:client:connected"
  | "socket:client:disconnected";

/** Base event shape — all events extend this */
interface BaseEvent<T extends EventType, P> {
  readonly type: T;
  readonly timestamp: string;       // ISO 8601
  readonly source: EventSource;
  readonly payload: P;
}

/** Payload types */
interface DaemonStartedPayload {
  readonly pid: number;
  readonly rootDir: string;
  readonly version: string;
}

interface DaemonHeartbeatPayload {
  readonly uptimeMs: number;
  readonly eventCount: number;
}

interface FsChangePayload {
  readonly path: string;             // relative to project root
  readonly absolutePath: string;
}

interface SocketClientPayload {
  readonly clientId: string;
}

/** Full discriminated union */
type TelesisDaemonEvent =
  | BaseEvent<"daemon:started", DaemonStartedPayload>
  | BaseEvent<"daemon:stopping", Record<string, never>>
  | BaseEvent<"daemon:stopped", Record<string, never>>
  | BaseEvent<"daemon:heartbeat", DaemonHeartbeatPayload>
  | BaseEvent<"fs:file:created", FsChangePayload>
  | BaseEvent<"fs:file:modified", FsChangePayload>
  | BaseEvent<"fs:file:deleted", FsChangePayload>
  | BaseEvent<"fs:dir:created", FsChangePayload>
  | BaseEvent<"fs:dir:deleted", FsChangePayload>
  | BaseEvent<"socket:client:connected", SocketClientPayload>
  | BaseEvent<"socket:client:disconnected", SocketClientPayload>;
```

### Socket protocol

The socket uses NDJSON (newline-delimited JSON). Three message types flow over it:

```typescript
/** Client → Server: request a command */
interface SocketRequest {
  readonly id: string;                // correlation ID (UUID)
  readonly command: "stop" | "status" | "subscribe" | "unsubscribe" | "ping";
}

/** Server → Client: response to a request */
interface SocketResponse {
  readonly id: string;                // echoes the request ID
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

/** Server → Subscribers: broadcast event */
interface SocketBroadcast {
  readonly broadcast: true;
  readonly event: TelesisDaemonEvent;
}

/** Any message received by a client */
type SocketMessage = SocketResponse | SocketBroadcast;
```

Buffer limit: 64KB per message. Messages exceeding this are dropped with a warning.

### Daemon startup flow

```
telesis daemon start
  → lifecycle.startDaemon(rootDir)
    → pid.readPid() → check if already running (kill -0)
    → If running: print "Daemon already running (PID N)" and exit
    → Bun.spawn(["telesis", "daemon", "__run"], {
        cwd: rootDir,
        stdio: ["ignore", "ignore", "ignore"],
        detached: true,
      })
    → spawned.unref()
    → Poll for PID file (100ms intervals, max 3s)
    → Print "Daemon started (PID N)"
```

The `__run` subcommand is hidden from help text. It is the actual daemon process:

```
telesis daemon __run
  → entrypoint.runDaemon(rootDir)
    → Create bus
    → Start watcher (rootDir, bus, config)
    → Start socket server (.telesis/daemon.sock, bus)
    → Write PID file (.telesis/daemon.pid)
    → Register signal handlers (SIGTERM, SIGINT)
    → Start heartbeat timer
    → Publish daemon:started event
    → Await shutdown signal
```

### Graceful shutdown sequence

When SIGTERM or SIGINT is received (or `stop` command arrives via socket):

1. Publish `daemon:stopping` event
2. Close filesystem watcher
3. Broadcast `daemon:stopped` to all subscribers
4. Close all client socket connections
5. Close socket server, remove `.telesis/daemon.sock`
6. Remove `.telesis/daemon.pid`
7. Dispose bus (complete the RxJS Subject)
8. Fallback: 5s timeout → `process.exit(1)`

### File locations

| Artifact | Path |
|----------|------|
| PID file | `.telesis/daemon.pid` |
| Socket | `.telesis/daemon.sock` |
| Config | `.telesis/config.yml` `daemon` section |

### Daemon configuration

```typescript
interface DaemonConfig {
  readonly watch?: {
    readonly ignore?: readonly string[];
  };
  readonly heartbeatIntervalMs?: number;
}
```

Parsed from `.telesis/config.yml` under the `daemon` key. All fields optional with
sensible defaults:
- `heartbeatIntervalMs`: 30000 (30s)
- `watch.ignore`: merged with built-in defaults

Built-in ignore patterns (always applied):
- `.telesis/`
- `node_modules/`
- `.git/`
- `dist/`
- `build/`
- `.next/`

---

## Integration points

All new daemon code lives under `src/daemon/`.

| Module | Status | Description |
|--------|--------|-------------|
| `src/daemon/types.ts` | NEW | Event union, socket protocol, config types, `createEvent` factory |
| `src/daemon/bus.ts` | NEW | RxJS Subject wrapper — sole rxjs importer |
| `src/daemon/watcher.ts` | NEW | `node:fs.watch` wrapper with ignore/debounce |
| `src/daemon/pid.ts` | NEW | PID file read/write/check/remove |
| `src/daemon/socket.ts` | NEW | Unix socket server, NDJSON framing, client tracking |
| `src/daemon/lifecycle.ts` | NEW | start/stop/status orchestration |
| `src/daemon/client.ts` | NEW | Socket client for CLI/TUI consumers |
| `src/daemon/entrypoint.ts` | NEW | Daemon main loop |
| `src/daemon/supervision.ts` | NEW | LaunchAgent/systemd unit generation |
| `src/daemon/tui.ts` | NEW | Event stream renderer |
| `src/cli/daemon.ts` | NEW | Commander subcommands |
| `src/index.ts` | MODIFIED | Register daemon command |
| `src/config/config.ts` | MODIFIED | Parse `DaemonConfig` from config |
| `src/drift/checks/rxjs-import.ts` | NEW | Containment check: rxjs only in bus.ts |
| `src/drift/checks/index.ts` | MODIFIED | Register new check |

---

## Testing strategy

| Module | Test approach |
|--------|--------------|
| `bus.ts` | Unit: publish/subscribe, ofType filtering, dispose completes subscriptions |
| `watcher.ts` | Unit: file creation/modification/deletion emit correct events, ignore patterns filter, debounce collapses rapid changes |
| `pid.ts` | Unit: write/read/remove, stale PID detection, concurrent write safety |
| `socket.ts` | Unit: NDJSON framing, command dispatch, subscriber broadcast, buffer limit enforcement, client tracking |
| `lifecycle.ts` | Unit: already-running detection, PID polling, stop via socket |
| `client.ts` | Unit: connect/disconnect, command send/receive, event callback |
| `supervision.ts` | Unit: generated plist/unit content validation |
| `tui.ts` | Unit: event formatting, ANSI color assignment |
| `rxjs-import.ts` | Unit: detection of rxjs imports outside bus.ts |

All tests use `useTempDir()` for filesystem operations. Socket tests use ephemeral
Unix sockets in temp directories to avoid port conflicts.

---

## Decisions

1. **`node:fs.watch({ recursive: true })` over chokidar or `Bun.watch`.** Zero external
   dependencies. `recursive: true` is supported on macOS (FSEvents) and Linux 5.9+
   (fanotify). Chokidar adds 15+ transitive deps. `Bun.watch` is Bun-specific and less
   portable to Node runtimes.

2. **Hidden `__run` subcommand.** The daemon runs as `telesis daemon __run` in a
   detached child process. This keeps the single-binary model — no separate daemon
   executable. The `__run` command is hidden from `--help` output.

3. **NDJSON over socket.** Consistent with the project's JSONL convention for telemetry,
   notes, journal, dismissals, and review sessions. Human-readable, debuggable with
   standard tools (`socat`, `nc`), and trivially parseable.

4. **RxJS `Subject` not `BehaviorSubject`.** Events are ephemeral — there is no meaningful
   "current value" to replay. New subscribers see events from the moment they connect, not
   historical events. Event persistence is deferred to v0.13.0.

5. **No event persistence in v0.12.0.** The daemon's event stream is ephemeral. Persistence
   to JSONL is deferred to v0.13.0 alongside the ACP dispatcher, which will need session
   replay. Building persistence now would be speculative.

6. **RxJS for event backbone over EventEmitter or Signals.** RxJS provides typed
   observables, `filter`/`map`/`debounceTime` operators, and automatic cleanup on
   `complete()`. EventEmitter lacks type safety on event payloads. Signals (TC39 Stage 1)
   are not mature enough. RxJS is contained to a single file (`bus.ts`).
