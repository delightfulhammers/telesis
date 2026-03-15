---
title: Event Reference
description: All event types emitted by the Telesis daemon
weight: 220
---

# Event Reference

Every significant action in Telesis emits a typed event through the daemon event backbone. Events share a common structure:

```typescript
{
  type: string          // Namespaced event type (e.g., "fs:file:modified")
  timestamp: string     // ISO 8601 timestamp
  source: string        // Origin component
  payload: object       // Type-specific data
}
```

## Event Sources

| Source | Origin |
|---|---|
| `daemon` | The daemon process itself |
| `filesystem` | File system watcher |
| `socket` | Unix socket IPC |
| `dispatch` | Agent dispatch sessions |
| `oversight` | Oversight observers |
| `intake` | Work item intake |
| `plan` | Plan lifecycle |
| `validation` | Task validation |
| `pipeline` | Full pipeline orchestration |
| `git` | Git operations |
| `github` | GitHub API operations |

## Filesystem Events

| Event | Payload | Description |
|---|---|---|
| `fs:file:created` | `{ path }` | New file detected |
| `fs:file:modified` | `{ path }` | Existing file changed |
| `fs:file:deleted` | `{ path }` | File removed |
| `fs:dir:created` | `{ path }` | New directory detected |
| `fs:dir:deleted` | `{ path }` | Directory removed |

## Daemon Events

| Event | Payload | Description |
|---|---|---|
| `daemon:started` | `{ pid, rootDir, version }` | Daemon started |
| `daemon:stopping` | — | Daemon shutting down |
| `daemon:stopped` | — | Daemon stopped |
| `daemon:heartbeat` | `{ uptimeMs, eventCount }` | Periodic health signal |

## Socket Events

| Event | Payload | Description |
|---|---|---|
| `socket:client:connected` | — | Client connected to Unix socket |
| `socket:client:disconnected` | — | Client disconnected |

## Dispatch Events

| Event | Payload | Description |
|---|---|---|
| `dispatch:session:started` | `{ sessionId, agent, task }` | Agent session created |
| `dispatch:session:completed` | `{ sessionId, durationMs, tokenUsage }` | Session finished successfully |
| `dispatch:session:failed` | `{ sessionId, error }` | Session failed |
| `dispatch:agent:thinking` | `{ sessionId, content }` | Agent reasoning step |
| `dispatch:agent:tool_call` | `{ sessionId, tool, arguments }` | Agent called a tool |
| `dispatch:agent:output` | `{ sessionId, content }` | Agent produced output |
| `dispatch:agent:cancelled` | `{ sessionId }` | Session was cancelled |

## Oversight Events

| Event | Payload | Description |
|---|---|---|
| `oversight:finding` | `{ observer, severity, summary, detail, eventRange }` | Observer flagged an issue |
| `oversight:note` | `{ text, tags }` | Observer recorded a note |
| `oversight:intervention` | `{ reason }` | Observer intervened in session |

## Intake Events

| Event | Payload | Description |
|---|---|---|
| `intake:item:imported` | `{ id, title, source }` | Work item imported |
| `intake:item:approved` | `{ id }` | Work item approved |
| `intake:item:dispatched` | `{ id, sessionId }` | Work item dispatched to agent |
| `intake:item:completed` | `{ id }` | Work item completed |
| `intake:item:failed` | `{ id, error }` | Work item failed |
| `intake:item:skipped` | `{ id }` | Work item skipped |
| `intake:sync:started` | `{ source }` | Intake sync started |
| `intake:sync:completed` | `{ imported, skipped, errors }` | Intake sync finished |

## Plan Events

| Event | Payload | Description |
|---|---|---|
| `plan:created` | `{ planId, workItemId, taskCount }` | Plan created |
| `plan:approved` | `{ planId }` | Plan approved for execution |
| `plan:executing` | `{ planId }` | Plan execution started |
| `plan:completed` | `{ planId }` | All tasks completed |
| `plan:failed` | `{ planId, error }` | Plan failed |
| `plan:awaiting_gate` | `{ planId }` | Plan waiting for human approval |
| `plan:task:started` | `{ planId, taskId, title }` | Task execution started |
| `plan:task:completed` | `{ planId, taskId }` | Task completed |
| `plan:task:failed` | `{ planId, taskId, error }` | Task failed |

## Validation Events

| Event | Payload | Description |
|---|---|---|
| `validation:started` | `{ planId, taskId }` | Validation started for task |
| `validation:passed` | `{ planId, taskId, criteria }` | All criteria met |
| `validation:failed` | `{ planId, taskId, failures }` | Some criteria not met |
| `validation:correction:started` | `{ planId, taskId, attempt }` | Correction retry started |
| `validation:escalated` | `{ planId, taskId, reason }` | Task escalated after max retries |

## Pipeline Events

| Event | Payload | Description |
|---|---|---|
| `pipeline:started` | `{ workItemId, title }` | Pipeline started |
| `pipeline:stage_changed` | `{ workItemId, stage }` | Pipeline transitioned to new stage |
| `pipeline:completed` | `{ workItemId, branch, sha }` | Pipeline finished successfully |
| `pipeline:failed` | `{ workItemId, stage, error }` | Pipeline failed at stage |

## Git Events

| Event | Payload | Description |
|---|---|---|
| `git:committed` | `{ sha, branch, filesChanged }` | Changes committed |
| `git:pushed` | `{ branch, remote }` | Branch pushed to remote |

## GitHub Events

| Event | Payload | Description |
|---|---|---|
| `github:pr_created` | `{ prNumber, prUrl }` | Pull request created |
| `github:issue_closed` | `{ issueNumber }` | Issue closed |

## Orchestrator Events

| Event | Payload | Description |
|---|---|---|
| `orchestrator:state_changed` | `{ fromState, toState, milestoneId? }` | Orchestrator transitioned between lifecycle states |
| `orchestrator:decision_created` | `{ decisionId, kind, summary }` | Human decision queued for approval |
| `orchestrator:decision_resolved` | `{ decisionId, kind, summary }` | Human decision approved or rejected |
| `orchestrator:error` | `{ error, state }` | Orchestrator encountered an error in state |
