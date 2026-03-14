---
title: The Daemon
description: Background process, event backbone, and live monitoring
weight: 110
---

# The Daemon

The Telesis daemon is a long-running background process that watches your project, emits typed events, and serves as the communication backbone for all Telesis components. Dispatch sessions, oversight observers, and the TUI all communicate through the daemon.

## Starting and Stopping

```bash
telesis daemon start    # Start the daemon (prints PID)
telesis daemon stop     # Stop the daemon
telesis daemon status   # Show status: PID, uptime, event count, client count
```

The daemon runs as a background process. It writes a PID file to `.telesis/daemon.pid` to prevent duplicate instances and serves a Unix socket at `.telesis/daemon.sock` for IPC.

## Installing as a System Service

For the daemon to start automatically when you log in:

```bash
telesis daemon install
```

On macOS, this creates a LaunchAgent. On Linux, this creates a systemd user service. Both require the compiled Telesis binary (not `bun run src/index.ts`).

## Live Event Monitoring

Connect to the daemon and stream events in real time:

```bash
telesis daemon tui
```

This displays a live feed of all events — filesystem changes, dispatch sessions, oversight findings, pipeline stage transitions, and more. It's the fastest way to understand what Telesis is doing at any moment.

## What the Daemon Watches

The daemon watches your project's filesystem using `node:fs.watch`. When files change, it emits typed filesystem events:

- `fs:file:created` — a new file appeared
- `fs:file:modified` — an existing file changed
- `fs:file:deleted` — a file was removed
- `fs:dir:created` — a new directory appeared
- `fs:dir:deleted` — a directory was removed

### Ignoring Paths

Configure which paths the daemon ignores:

```yaml
daemon:
  watch:
    ignore:
      - "node_modules/**"
      - "dist/**"
      - ".git/**"
```

## The Event Backbone

The daemon isn't just a file watcher — it's the central event bus for all Telesis activity. Every significant action emits a typed event through the daemon:

- **Dispatch events** — agent session started, thinking, tool calls, output, completion, failure
- **Oversight events** — observer findings, notes, interventions
- **Intake events** — items imported, approved, dispatched, completed
- **Plan events** — plans created, approved, executing, completed, failed
- **Validation events** — validation started, passed, failed, correction, escalation
- **Pipeline events** — pipeline started, stage changed, completed, failed
- **Git events** — committed, pushed
- **GitHub events** — PR created, issue closed

All events share a common structure: type, ISO timestamp, source, and a typed payload. See the [Event Reference]({{< relref "events" >}}) for the complete catalog.

## Communication Protocol

The daemon serves a Unix socket using NDJSON (newline-delimited JSON). Clients connect to `.telesis/daemon.sock` and receive events as they occur. This is how the TUI, oversight observers, and other Telesis components stay synchronized.

## Heartbeat

The daemon emits periodic heartbeat events with uptime and event count information. Configure the interval:

```yaml
daemon:
  heartbeatIntervalMs: 5000   # Default: 5 seconds
```

Heartbeats are useful for monitoring: if a connected client stops receiving heartbeats, it knows the daemon has died.

## When You Need the Daemon

The daemon is required for:

- `telesis daemon tui` — live event monitoring
- Oversight observers — they connect to the daemon to watch dispatch sessions
- Real-time pipeline monitoring — stage transitions are emitted as events

The daemon is *not* required for:

- `telesis init`, `telesis review`, `telesis drift`, `telesis status` — these work standalone
- `telesis dispatch` — dispatches agents directly, though events flow through the daemon if running
- `telesis run` — works without the daemon, but emits events to it if available
