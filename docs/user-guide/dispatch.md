---
title: Agent Dispatch
description: Running coding agents with oversight
weight: 120
---

# Agent Dispatch

`telesis dispatch` runs coding agents against your project — dispatching tasks, streaming events, and persisting full session logs for replay and analysis. It uses the Agent Client Protocol (ACP) to communicate with agents, meaning any ACP-compatible agent works: Claude Code, Codex, Gemini, or custom agents.

## Running an Agent

```bash
telesis dispatch run "Fix the authentication bug in src/auth/middleware.ts"
```

This dispatches the default agent with the given task description. Events stream to your terminal in real time: thinking, tool calls, output.

### Selecting an Agent

```bash
telesis dispatch run "Add pagination to the users endpoint" --agent claude
telesis dispatch run "Add pagination to the users endpoint" --agent codex
```

Or configure the default:

```yaml
dispatch:
  defaultAgent: claude
```

### Disabling Oversight

By default, if oversight observers are configured, they monitor the dispatch session and can flag concerns or intervene. To run without oversight:

```bash
telesis dispatch run "Quick formatting fix" --no-oversight
```

## Session Management

Every dispatch creates a session with a unique ID. Session data is stored in `.telesis/sessions/`:

- `<session-id>.meta.json` — session metadata (agent, task, status, timestamps, token usage)
- `<session-id>.events.jsonl` — full event log (every thinking step, tool call, output)

### Listing Sessions

```bash
telesis dispatch list
telesis dispatch list --json
```

### Viewing a Session

```bash
telesis dispatch show <session-id>
```

The session ID supports prefix matching — you don't need to type the full UUID.

The `show` command replays the session event log, reconstructing a readable narrative of what the agent did: what it was thinking, which tools it called, what output it produced, and whether it succeeded or failed.

For a full narrative reconstruction — a continuous prose account of the agent's actions — use the `--text` flag:

```bash
telesis dispatch show <session-id> --text
```

This produces a human-readable narrative from the raw event stream, useful for sharing session summaries or reviewing agent behavior at a higher level than the raw event log.

## Configuration

```yaml
dispatch:
  defaultAgent: claude       # Default agent name
  maxConcurrent: 3           # Maximum concurrent dispatch sessions
  acpxPath: /path/to/acpx   # Path to acpx binary (auto-detected if not set)
```

### Agent Binary Detection

Telesis auto-detects the ACP binary (`acpx`) on your PATH. If it's installed in a non-standard location, set `dispatch.acpxPath` explicitly.

## Concurrency

Telesis supports bounded concurrent dispatch — multiple agents running simultaneously. The `maxConcurrent` setting (default: 3) limits how many sessions can be active at once. Requests beyond the limit are queued.

## Crash Detection

If an agent crashes or the ACP subprocess dies unexpectedly, Telesis detects the failure and:

1. Marks the session as failed
2. Emits a `dispatch:session:failed` event
3. Reports the error clearly — no silent swallowing

The session event log is preserved even after a crash, so you can inspect what happened.

## Events During Dispatch

While a dispatch is running, these events flow through the daemon:

- `dispatch:session:started` — session created with agent name and task
- `dispatch:agent:thinking` — agent is reasoning (thinking step content)
- `dispatch:agent:tool_call` — agent called a tool (tool name, arguments)
- `dispatch:agent:output` — agent produced output (text content)
- `dispatch:agent:cancelled` — session was cancelled
- `dispatch:session:completed` — session finished successfully
- `dispatch:session:failed` — session failed with error

Monitor these in real time with `telesis daemon tui`.
