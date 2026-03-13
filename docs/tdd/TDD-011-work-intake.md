# TDD-011 — Work Intake

**Status:** Accepted
**Date:** 2026-03-13
**Author:** Delightful Hammers
**Related:** v0.15.0 milestone

---

## Overview

Telesis v0.14.x added active oversight — observer agents monitor coding sessions in real
time. The dispatch pipeline works: `telesis dispatch run "task"` spawns an agent, streams
events, persists sessions. But work still enters the system manually — the human types
the task.

v0.15.0 bridges **GitHub Issues** to the dispatch pipeline. Issues are imported, normalized
into a common format, presented for human approval, and dispatched to coding agents
automatically. This closes the gap between "work exists" and "work is being done."

The `IntakeSource` adapter interface is designed for extensibility — Jira, Linear, or other
sources can be added later by implementing the same interface. This milestone establishes
the pattern with GitHub only.

### What this TDD addresses

- Work item types and status lifecycle (`pending` → `approved` → `dispatching` → `completed`/`failed`/`skipped`)
- `IntakeSource` adapter interface for pluggable work sources
- Per-item JSON store in `.telesis/intake/` (atomic writes, prefix resolution)
- GitHub source adapter (issue fetching, PR filtering, label/assignee filtering)
- Sync orchestrator (fetch → dedup → normalize → store)
- Approval and dispatch bridge (approve → dispatch → track completion)
- Intake-specific daemon events (`intake:*`)
- CLI commands (`telesis intake github|list|show|approve|skip`)
- Config format for intake sources

### What this TDD does not address (scope boundary)

- Linear or Jira adapters (future milestones)
- Interactive TUI for work item approval (future — daemon-driven)
- Background/daemon-driven automatic approval
- Work item prioritization or scheduling
- Planning agent decomposition of work items into subtasks
- Multi-project intake
- Webhook-driven real-time issue sync
- Issue comment sync or bidirectional updates

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Process                        │
│                                                         │
│  telesis intake github                                  │
│    │                                                    │
│    ▼                                                    │
│  ┌──────────────────┐    ┌────────────────────┐         │
│  │  GitHub Source    │───▶│  Sync Orchestrator │         │
│  │  (IntakeSource)  │    │                    │         │
│  └──────────────────┘    └────────┬───────────┘         │
│                                   │                     │
│                                   ▼                     │
│                          ┌────────────────┐             │
│                          │  Work Item     │             │
│                          │  Store         │             │
│                          │ .telesis/      │             │
│                          │   intake/      │             │
│                          └────────┬───────┘             │
│                                   │                     │
│  telesis intake approve <id>      │                     │
│    │                              │                     │
│    ▼                              ▼                     │
│  ┌──────────────────┐    ┌────────────────┐             │
│  │  Approve Bridge  │───▶│  Dispatcher    │             │
│  │                  │    │  (existing)    │             │
│  └──────────────────┘    └────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

All new code lives under `src/intake/`. The GitHub API client (`src/github/client.ts`)
gains a `listRepoIssues()` function. Config parsing (`src/config/config.ts`) gains
`parseIntakeConfig()`.

---

## Types

### WorkItem

The canonical internal representation of a unit of work from any source.

```typescript
type WorkItemStatus =
  | "pending" | "approved" | "dispatching"
  | "completed" | "failed" | "skipped";

type IntakeSourceKind = "github";  // extensible: add "jira" | "linear" later

interface WorkItem {
  readonly id: string;              // UUID
  readonly source: IntakeSourceKind;
  readonly sourceId: string;        // e.g. "42" for GitHub issue #42
  readonly sourceUrl: string;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly assignee?: string;
  readonly priority?: string;
  readonly status: WorkItemStatus;
  readonly importedAt: string;      // ISO 8601
  readonly approvedAt?: string;
  readonly dispatchedAt?: string;
  readonly completedAt?: string;
  readonly sessionId?: string;      // links to dispatch session
  readonly error?: string;
}
```

### IntakeSource

The adapter interface for external work sources. Each source fetches raw issues and
normalizes them to `RawIssue`. The sync orchestrator handles dedup and persistence.

```typescript
interface RawIssue {
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly assignee?: string;
  readonly priority?: string;
}

interface IntakeSource {
  readonly kind: IntakeSourceKind;
  readonly fetchIssues: () => Promise<readonly RawIssue[]>;
}
```

### IntakeSyncResult

```typescript
interface IntakeSyncResult {
  readonly imported: number;
  readonly skippedDuplicate: number;
  readonly errors: readonly string[];
}
```

---

## Store Format

Per-item JSON files in `.telesis/intake/`, following the `src/dispatch/store.ts` pattern:

- **Path:** `.telesis/intake/{uuid}.json`
- **Writes:** Atomic temp file + rename (no corruption on crash)
- **Reads:** JSON.parse with validation guard
- **Prefix resolution:** Supports both exact and unambiguous prefix matching
- **Dedup:** `findBySourceId(rootDir, source, sourceId)` scans all items

### Store API

```typescript
createWorkItem(rootDir, item): void
updateWorkItem(rootDir, item): void          // atomic temp+rename
loadWorkItem(rootDir, idOrPrefix): WorkItem | null
listWorkItems(rootDir, filter?): readonly WorkItem[]
findBySourceId(rootDir, source, sourceId): WorkItem | null
```

---

## Config Format

Added to `.telesis/config.yml` under an `intake` key:

```yaml
intake:
  github:
    labels:
      - "telesis"
      - "ready"
    excludeLabels:
      - "wontfix"
    assignee: "username"
    state: "open"          # default: "open"
```

All fields are optional. Missing config returns `{}` (lenient parsing).

```typescript
interface IntakeGitHubConfig {
  readonly labels?: readonly string[];
  readonly excludeLabels?: readonly string[];
  readonly assignee?: string;
  readonly state?: string;
}

interface IntakeConfig {
  readonly github?: IntakeGitHubConfig;
}
```

---

## Event Types

New daemon events for intake operations:

| Event Type | Payload | Description |
|---|---|---|
| `intake:item:imported` | `IntakeItemPayload` | Work item created from sync |
| `intake:item:approved` | `IntakeItemPayload` | Human approved item |
| `intake:item:dispatched` | `IntakeItemPayload` | Dispatch started |
| `intake:item:completed` | `IntakeItemPayload` | Agent finished |
| `intake:item:failed` | `IntakeItemPayload` | Dispatch failed |
| `intake:item:skipped` | `IntakeItemPayload` | Item marked skipped |
| `intake:sync:started` | `IntakeSyncPayload` | Sync began |
| `intake:sync:completed` | `IntakeSyncPayload` | Sync finished |

```typescript
interface IntakeItemPayload {
  readonly itemId: string;
  readonly source: string;
  readonly sourceId: string;
  readonly title: string;
}

interface IntakeSyncPayload {
  readonly source: string;
  readonly imported: number;
  readonly skippedDuplicate: number;
}
```

All intake events use the `"intake"` event source. TUI renders them in cyan.

---

## CLI Commands

```
telesis intake github                    # sync from GitHub
telesis intake list                      # list pending work items
telesis intake list --all                # list all statuses
telesis intake list --json               # JSON output
telesis intake show <id>                 # show work item detail
telesis intake approve <id>              # approve and dispatch
telesis intake approve <id> --agent <name>  # with specific agent
telesis intake skip <id>                 # mark as skipped
```

---

## Approval Flow

`approveWorkItem` is synchronous and blocking, matching `telesis dispatch run` behavior:

1. Load item, verify status is `pending`
2. Update to `approved` (with `approvedAt` timestamp)
3. Update to `dispatching` (with `dispatchedAt` timestamp)
4. Call `dispatch(deps, agent, taskText)` — blocks until agent finishes
5. On success: update to `completed`, link `sessionId`
6. On failure: update to `failed`, record error

`skipWorkItem` transitions from `pending` to `skipped`.

---

## Decisions

1. **GitHub-only for v0.15.0.** Establishes the IntakeSource pattern. Jira/Linear
   added later by implementing the same interface. Keeps scope tight.

2. **Per-item JSON, not JSONL.** Work items have mutable status that changes multiple
   times. JSONL is append-only. Per-item JSON with atomic writes matches the dispatch
   session store pattern and supports random-access updates.

3. **Synchronous approval flow.** `telesis intake approve <id>` blocks while dispatch
   runs, matching `telesis dispatch run` behavior. User sees real-time streaming.
   Background/daemon-driven approval is out of scope.

4. **IntakeSource adapter interface.** Clean abstraction. Adding Jira later = one new
   file implementing IntakeSource + one new CLI subcommand.

5. **TUI = daemon events + CLI list.** Pending work items are surfaced via intake events
   in the daemon event stream plus `telesis intake list`. No interactive TUI.

---

## Testing Strategy

- All tests colocated with source: `store.test.ts`, `sync.test.ts`, etc.
- Tests use `useTempDir()` from `src/test-utils.ts`
- GitHub source tests mock `fetch` — no live API calls
- Sync tests use a fake `IntakeSource` implementation
- Approve tests use a fake dispatch adapter
- Store tests cover CRUD, prefix resolution, dedup, filter, missing directory
