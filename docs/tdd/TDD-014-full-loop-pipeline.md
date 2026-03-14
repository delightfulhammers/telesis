# TDD-014 — Full Loop Pipeline

**Status:** Accepted
**Date:** 2026-03-13
**Author:** Delightful Hammers
**Related:** v0.18.0 milestone

---

## Overview

v0.15.0–v0.17.0 built the pipeline pieces: intake (GitHub issues → work items), planning
(LLM decomposition into task graphs), dispatch (agent execution via acpx), and validation
with correction retries. But each step requires manual CLI invocation, and after plan
execution completes, the user must manually commit, push, and create PRs. There is no
command that stitches the full loop together.

v0.18.0 adds a `telesis run` command that orchestrates the complete pipeline — from work
item to committed code — with human gates at plan approval and milestone completion. It also
adds a git operations module and GitHub PR/issue management, then validates the full loop
by running it on the Telesis repo itself.

### What this TDD addresses

- Git operations module (`src/git/`) for branch, commit, push with typed results
- Deterministic commit message generation from plan + work item metadata
- GitHub PR creation and issue close/comment operations (`src/github/pr.ts`)
- Extraction of shared HTTP helpers from `src/github/client.ts` into `src/github/http.ts`
- Git and pipeline config sections in `.telesis/config.yml`
- Pipeline orchestrator (`src/pipeline/`) that sequences the full intake→plan→execute→commit→push→PR loop
- `telesis run` CLI command with interactive plan approval and configurable git behavior
- New daemon events for pipeline and git lifecycle
- Self-hosting validation by running the full loop on the Telesis repo

### What this TDD does not address (scope boundary)

- Daemon-driven reactive orchestration (pipeline is CLI-initiated)
- Git worktree isolation for parallel plans
- Parallel plan execution
- Automated PR merge or branch cleanup
- LLM-generated commit messages (deterministic templates only)
- Issue metadata sync (labels, assignees) back to GitHub
- Webhook/CI integration for auto-triggering intake
- Git conflict resolution assistance
- Pipeline resumability after partial crashes
- Consolidation of existing git operations from `diff-capture.ts` or `review/diff.ts`

---

## Architecture

```
telesis run <work-item-id>
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│                     Pipeline Orchestrator                      │
│                                                                │
│  1. Load work item (must be pending or approved)               │
│  2. Create plan via createPlanFromWorkItem()                   │
│  3. Display plan, prompt for approval (unless --auto-approve)  │
│  4. Approve plan                                               │
│  5. Execute plan via executePlan() with validation              │
│  6. If awaiting_gate → prompt for gate approval                │
│  7. If failed/escalated → return early with error              │
│                                                                │
│  ── Git Operations (if changes exist) ────────────────────     │
│  8. Create branch (unless commitToMain)                        │
│  9. Stage all + commit (deterministic message)                 │
│  10. Push (if pushAfterCommit, with --set-upstream)            │
│  11. Create PR (if createPR and on a branch)                   │
│                                                                │
│  ── Cleanup ──────────────────────────────────────────────     │
│  12. Close issue (if closeIssue and source is GitHub)          │
│  13. Update work item status to completed                      │
│  14. Emit pipeline events throughout                           │
└──────────────────────────────────────────────────────────────┘
```

### New packages

| Package | Purpose |
|---------|---------|
| `src/git/` | Git write operations (branch, commit, push) via `execFileSync` |
| `src/pipeline/` | Full loop orchestrator that sequences existing subsystems |
| `src/github/http.ts` | Extracted shared HTTP helpers from `client.ts` |
| `src/github/pr.ts` | PR creation, issue close, issue comment |

### Reused subsystems

| Subsystem | Module |
|-----------|--------|
| Plan creation | `src/plan/create.ts` |
| Plan execution | `src/plan/executor.ts` |
| Plan/work item storage | `src/plan/store.ts`, `src/intake/store.ts` |
| Config parsing | `src/config/config.ts` |
| GitHub repo detection | `src/github/environment.ts` |
| Event factory | `src/daemon/types.ts` |

---

## Types

### Git Operations (`src/git/types.ts`)

```typescript
export interface CommitResult {
  readonly sha: string;
  readonly branch: string;
  readonly message: string;
  readonly filesChanged: number;
}

export interface PushResult {
  readonly branch: string;
  readonly remote: string;
}
```

### Config (`src/config/config.ts`)

```typescript
export interface GitConfig {
  readonly branchPrefix?: string;     // default: "telesis/"
  readonly commitToMain?: boolean;    // default: false
  readonly pushAfterCommit?: boolean; // default: true
  readonly createPR?: boolean;        // default: false
}

export interface PipelineConfig {
  readonly autoApprove?: boolean;     // default: false
  readonly closeIssue?: boolean;      // default: false
}
```

### Pipeline (`src/pipeline/types.ts`)

```typescript
export interface RunDeps {
  readonly rootDir: string;
  readonly adapter: AgentAdapter;
  readonly agent: string;
  readonly modelClient: ModelClient;
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly gitConfig: GitConfig;
  readonly pipelineConfig: PipelineConfig;
  readonly validationConfig: ValidationConfig;
  readonly plannerConfig: PlannerConfig;
  readonly dispatchConfig: DispatchConfig;
  readonly confirm: (message: string) => Promise<boolean>;
}

export type RunStage =
  | "planning" | "awaiting_approval" | "executing" | "awaiting_gate"
  | "committing" | "pushing" | "creating_pr" | "closing_issue"
  | "completed" | "failed";

export interface RunResult {
  readonly workItemId: string;
  readonly planId: string;
  readonly stage: RunStage;
  readonly commitResult?: CommitResult;
  readonly pushResult?: PushResult;
  readonly prUrl?: string;
  readonly error?: string;
  readonly durationMs: number;
}
```

---

## Key Design Decisions

### 1. CLI-driven, not daemon-driven

The full loop is a blocking CLI command. The daemon event bus broadcasts events but does
not orchestrate. This avoids complexity and matches the existing pattern where all actions
are CLI-initiated.

### 2. Deterministic commit messages

No LLM call for commit messages. The work item title (human-written) is the best summary.
Format: `feat: <work item title> (#<issue number>)\n\nPlan: <plan title>\n...`

### 3. One commit per plan

The validation loop may produce multiple correction attempts per task. A single coherent
commit after all tasks complete is cleaner than per-task commits.

### 4. Branching is configurable

`commitToMain: true` for projects like Telesis that commit directly.
`commitToMain: false` (default) creates a feature branch. PR creation is separate opt-in.

### 5. Human gates are interactive prompts

Plan approval and milestone gates use `readline` prompts.
`--auto-approve` bypasses for scripted/CI use.

### 6. No conflict resolution

If the branch has merge conflicts, the pipeline fails with a clear error.
The human resolves conflicts manually.

### 7. No git consolidation yet

`src/git/` is additive — existing git ops in `diff-capture.ts` and `review/diff.ts`
remain as-is. Consolidation is a follow-up refactor.

### 8. GitHub operations are optional

PR creation and issue closure require `GITHUB_TOKEN` and explicit config opt-in.
The pipeline works without GitHub connectivity.

---

## Event Types

New event sources: `"pipeline"`, `"git"`

| Event Type | Source | Payload |
|------------|--------|---------|
| `pipeline:started` | pipeline | `PipelineEventPayload` |
| `pipeline:stage_changed` | pipeline | `PipelineStagePayload` |
| `pipeline:completed` | pipeline | `PipelineEventPayload` |
| `pipeline:failed` | pipeline | `PipelineEventPayload` |
| `git:committed` | git | `GitCommitPayload` |
| `git:pushed` | git | `GitPushPayload` |
| `github:pr_created` | pipeline | `GitHubPRCreatedPayload` |
| `github:issue_closed` | pipeline | `GitHubIssueClosedPayload` |

---

## CLI Interface

```
telesis run <work-item-id>
  --agent <name>       Agent to use (default from config)
  --auto-approve       Skip plan confirmation prompt
  --no-push            Skip push after commit
  --no-validate        Skip validation loop
  --branch <name>      Override branch name
```

---

## Test Strategy

All tests use temp directories and mock dependencies. No live git repos or API calls.

### Git operations tests
- `currentBranch()` returns branch name from `git rev-parse`
- `hasChanges()` detects dirty working tree
- `createBranch()` creates and checks out new branch
- `stageAll()` stages all changes
- `commit()` creates commit and returns typed result
- `push()` pushes branch to remote
- `remoteBranchExists()` checks remote branch existence

### Commit message tests
- Generates conventional commit format from plan + work item
- Includes issue number when source is GitHub
- Handles missing optional fields

### GitHub PR tests
- `createPullRequest()` posts to correct API endpoint
- `closeIssue()` patches issue state to closed
- `commentOnIssue()` posts comment body

### Pipeline orchestrator tests
- Happy path: plan → approve → execute → commit → push → PR → complete
- Plan rejection stops pipeline
- Execution failure returns error result
- Escalation returns error result
- Gate approval prompts user
- No changes skips git operations
- `commitToMain` mode skips branch creation
- `createPR` mode creates PR
- `closeIssue` mode closes GitHub issue

### Format tests
- Formats successful run result
- Formats failed run result
- Formats partial results (committed but not pushed)
