---
title: Configuration Reference
description: Complete .telesis/config.yml documentation
weight: 210
---

# Configuration Reference

All Telesis configuration lives in `.telesis/config.yml`. This file is created during `telesis init` with project metadata and sensible defaults. Every setting is optional except the `project` block.

## Project (Required)

```yaml
project:
  name: "Your Project"
  owner: "Your Name or Team"
  language: "TypeScript"
  status: "active"
  repo: "github.com/you/your-project"
```

| Field | Description |
|---|---|
| `name` | Project name, used in generated docs and context |
| `owner` | Owner or team name |
| `language` | Primary programming language |
| `status` | Project status: `active`, `paused`, `archived` |
| `repo` | Repository URL (used for GitHub integration) |

## Review

```yaml
review:
  model: claude-sonnet-4-6
  judgeModel: claude-haiku-4-5-20251001
  personas:
    - slug: performance
      model: claude-sonnet-4-6
    - slug: accessibility
```

| Field | Default | Description |
|---|---|---|
| `model` | `claude-sonnet-4-6` | Model used for review analysis |
| `judgeModel` | `claude-haiku-4-5-20251001` | Model used for LLM judge (dismissal re-raise detection) |
| `personas` | — | Custom persona overrides (in addition to built-in security, architecture, correctness) |
| `personas[].slug` | — | Persona identifier |
| `personas[].model` | Inherits `review.model` | Override model for this persona |

## Dispatch

```yaml
dispatch:
  defaultAgent: claude
  maxConcurrent: 3
  acpxPath: /usr/local/bin/acpx
```

| Field | Default | Description |
|---|---|---|
| `defaultAgent` | `claude` | Agent used when `--agent` is not specified |
| `maxConcurrent` | `3` | Maximum concurrent dispatch sessions |
| `acpxPath` | Auto-detected | Path to the `acpx` binary |

## Oversight

```yaml
oversight:
  enabled: true
  defaultModel: claude-sonnet-4-6
```

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` if observer policies exist | Enable oversight observers during dispatch |
| `defaultModel` | `claude-sonnet-4-6` | Model used by oversight observers |

## Intake

```yaml
intake:
  github:
    labels:
      - bug
      - feature
    excludeLabels:
      - wontfix
      - duplicate
    assignee: your-username
    state: open
```

| Field | Default | Description |
|---|---|---|
| `github.labels` | — | Only import issues with these labels |
| `github.excludeLabels` | — | Skip issues with these labels |
| `github.assignee` | — | Only import issues assigned to this user |
| `github.state` | `open` | Issue state filter: `open`, `closed`, `all` |

## Planner

```yaml
planner:
  model: claude-sonnet-4-6
  maxTasks: 20
```

| Field | Default | Description |
|---|---|---|
| `model` | `claude-sonnet-4-6` | Model used for plan decomposition |
| `maxTasks` | — | Maximum number of tasks per plan |

## Validation

```yaml
validation:
  model: claude-sonnet-4-6
  maxRetries: 3
  enableGates: false
```

| Field | Default | Description |
|---|---|---|
| `model` | `claude-sonnet-4-6` | Model used for task validation |
| `maxRetries` | `3` | Number of retry attempts before escalating a task |
| `enableGates` | `false` | Require human approval after plan completion |

## Git

```yaml
git:
  branchPrefix: "telesis/"
  commitToMain: false
  pushAfterCommit: true
  createPR: false
  llmCommitMessages: false
  llmPRBody: false
```

| Field | Default | Description |
|---|---|---|
| `branchPrefix` | `telesis/` | Prefix for auto-created branches |
| `commitToMain` | `false` | Skip branching; commit directly to current branch |
| `pushAfterCommit` | `true` | Automatically push after committing |
| `createPR` | `false` | Create a GitHub PR after pushing (requires `GITHUB_TOKEN`) |
| `llmCommitMessages` | `false` | Generate commit messages with an LLM from diff and plan context |
| `llmPRBody` | `false` | Generate PR descriptions with an LLM from plan and diff context |

## Pipeline

```yaml
pipeline:
  autoApprove: false
  closeIssue: false
  reviewBeforePush: false
  reviewBlockThreshold: high
  qualityGates:
    format: "pnpm run format"
    lint: "pnpm run lint"
    test: "pnpm test"
    build: "pnpm run build"
    drift: true
```

| Field | Default | Description |
|---|---|---|
| `autoApprove` | `false` | Skip plan confirmation prompt in `telesis run` |
| `closeIssue` | `false` | Close source GitHub issue on pipeline completion |
| `reviewBeforePush` | `false` | Run code review before pushing changes |
| `reviewBlockThreshold` | `high` | Minimum severity to block push: `critical`, `high`, `medium`, `low` |
| `qualityGates` | — | Automated checks run before committing |
| `qualityGates.format` | — | Shell command for formatting check |
| `qualityGates.lint` | — | Shell command for linting check |
| `qualityGates.test` | — | Shell command for test suite |
| `qualityGates.build` | — | Shell command for build verification |
| `qualityGates.drift` | — | Run `telesis drift` (boolean, not a shell command) |

## Daemon

```yaml
daemon:
  watch:
    ignore:
      - "node_modules/**"
      - "dist/**"
      - ".git/**"
  heartbeatIntervalMs: 5000
```

| Field | Default | Description |
|---|---|---|
| `watch.ignore` | — | Glob patterns for paths the daemon should not watch |
| `heartbeatIntervalMs` | `5000` | Interval between heartbeat events (milliseconds) |

## Environment Variables

These are not in `config.yml` but affect Telesis behavior:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | API key for all model calls |
| `GITHUB_TOKEN` | For GitHub features | GitHub personal access token |

## Minimal Configuration

A working config needs only the project block. Everything else has sensible defaults:

```yaml
project:
  name: "My Project"
  owner: "Me"
  language: "TypeScript"
  status: "active"
  repo: "github.com/me/my-project"
```

## Full Configuration Example

```yaml
project:
  name: "My Project"
  owner: "My Team"
  language: "TypeScript"
  status: "active"
  repo: "github.com/myteam/my-project"

review:
  model: claude-sonnet-4-6
  judgeModel: claude-haiku-4-5-20251001
  personas:
    - slug: performance

dispatch:
  defaultAgent: claude
  maxConcurrent: 3

oversight:
  enabled: true
  defaultModel: claude-sonnet-4-6

intake:
  github:
    labels: ["bug", "feature", "enhancement"]
    excludeLabels: ["wontfix"]
    state: open

planner:
  model: claude-sonnet-4-6
  maxTasks: 15

validation:
  model: claude-sonnet-4-6
  maxRetries: 3
  enableGates: false

git:
  branchPrefix: "telesis/"
  commitToMain: false
  pushAfterCommit: true
  createPR: true
  llmCommitMessages: true
  llmPRBody: true

pipeline:
  autoApprove: false
  closeIssue: true
  reviewBeforePush: true
  reviewBlockThreshold: high
  qualityGates:
    format: "pnpm run format"
    lint: "pnpm run lint"
    test: "pnpm test"
    build: "pnpm run build"
    drift: true

daemon:
  watch:
    ignore:
      - "node_modules/**"
      - "dist/**"
      - ".git/**"
  heartbeatIntervalMs: 5000
```
