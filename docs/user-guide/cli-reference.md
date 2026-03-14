---
title: CLI Reference
description: Every command, flag, and option
weight: 200
---

# CLI Reference

Complete reference for all Telesis CLI commands.

## telesis init

Initialize a new Telesis project with an AI-powered interview.

```
telesis init
```

Requires `ANTHROPIC_API_KEY`. Creates `docs/VISION.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/MILESTONES.md`, `.telesis/config.yml`, and `CLAUDE.md`. If an interrupted interview state exists (`.telesis/interview-state.json`), it resumes automatically.

---

## telesis context

Regenerate `CLAUDE.md` from current project documents.

```
telesis context
```

Idempotent — safe to run repeatedly. Reads all docs, scans ADRs and TDDs, extracts milestones and principles, and includes any files in `docs/context/` verbatim.

---

## telesis status

Print project state summary.

```
telesis status
```

Displays: project name, status, ADR count, TDD count, note count, active milestone, CLAUDE.md generation timestamp, total token usage, and estimated cost.

---

## telesis eval

Evaluate the quality of generated documents.

```
telesis eval [--json]
```

| Flag | Description |
|---|---|
| `--json` | Output results as JSON |

Runs evaluators for structural completeness, specificity, actionability, coverage, and consistency.

---

## telesis drift

Detect drift between spec and implementation.

```
telesis drift [--check <name...>] [--json] [--github-pr]
```

| Flag | Description |
|---|---|
| `--check <name...>` | Run only the named checks |
| `--json` | Output results as JSON |
| `--github-pr` | Post results as a PR comment (idempotent) |

Exits 1 if any error-severity finding is detected.

**Available checks:** `sdk-import`, `commander-import`, `no-process-exit`, `expected-directories`, `test-colocation`, `command-registration`, `claude-md-freshness`, `stale-references`, `milestone-tdd-consistency`, `version-consistency`, `tdd-coverage`, `acpx-import`, `cli-version-sync`, `rxjs-import`

---

## telesis review

Multi-perspective code review.

```
telesis review [options]
```

### Review Options

| Flag | Description |
|---|---|
| `--all` | Review working + staged changes (default: staged only) |
| `--ref <ref>` | Diff against ref (e.g., `main`, `main...HEAD`) |
| `--single` | Single-pass review (no personas) |
| `--personas <slugs>` | Comma-separated persona list |
| `--min-severity <level>` | Filter: `critical`, `high`, `medium`, `low` |
| `--no-dedup` | Skip cross-persona deduplication |
| `--no-themes` | Skip theme extraction from prior sessions |
| `--no-verify` | Skip full-file verification |
| `--json` | Output results as JSON |
| `--github-pr` | Post findings as inline PR comments |

### Session Management

| Command | Description |
|---|---|
| `telesis review --list` | List past review sessions |
| `telesis review --show <id>` | Show findings from a past session |

### Dismissals

| Command | Description |
|---|---|
| `telesis review dismiss <id> --reason <category> [--note <text>]` | Dismiss a finding |
| `telesis review dismissals [--json]` | List all dismissals |
| `telesis review dismissal-stats [--json]` | Aggregated dismissal statistics |
| `telesis review sync-dismissals --pr <N>` | Import dismissals from GitHub PR threads |
| `telesis review sync-replies --pr <N>` | Post dismissal replies to GitHub PR threads |

**Dismissal reasons:** `false-positive`, `not-actionable`, `already-addressed`, `style-preference`

Exits 1 when critical or high severity findings are present.

---

## telesis note

Development notes.

| Command | Description |
|---|---|
| `telesis note add <text> [-t\|--tag <tag>...]` | Add a note (use `-` to read from stdin) |
| `telesis note list [--tag <tag>] [--json]` | List notes (newest first) |

---

## telesis journal

Design journal.

| Command | Description |
|---|---|
| `telesis journal add <title> <body>` | Add a journal entry |
| `telesis journal list [--json]` | List entries (newest first) |
| `telesis journal show <query>` | Show entry by ID, date, or title substring |

---

## telesis adr

Architectural Decision Records.

| Command | Description |
|---|---|
| `telesis adr new <slug>` | Create a new ADR from template (auto-incremented number) |

Slug should be lowercase with hyphens (e.g., `typescript-agent-layer`).

---

## telesis tdd

Technical Design Documents.

| Command | Description |
|---|---|
| `telesis tdd new <slug>` | Create a new TDD from template (auto-incremented number) |

---

## telesis milestone

Milestone management.

| Command | Description |
|---|---|
| `telesis milestone check` | Validate active milestone readiness (runs drift, tests, build, lint) |
| `telesis milestone complete` | Mark milestone complete (bumps version, updates TDDs, regenerates CLAUDE.md) |

`telesis milestone check` exits 1 on any automated failure.

---

## telesis intake

Work item intake.

| Command | Description |
|---|---|
| `telesis intake github` | Import open issues from configured GitHub repo |
| `telesis intake list [--all] [--json]` | List work items (default: active only) |
| `telesis intake show <id>` | Show work item details (supports ID prefix) |
| `telesis intake approve <id> [--agent <name>] [--plan]` | Approve and optionally dispatch or plan |
| `telesis intake skip <id>` | Mark work item as skipped |

Requires `GITHUB_TOKEN` for GitHub import.

---

## telesis plan

Task planning and execution.

| Command | Description |
|---|---|
| `telesis plan create <work-item-id>` | Decompose work item into tasks |
| `telesis plan list [--all] [--json]` | List plans (default: non-completed) |
| `telesis plan show <plan-id>` | Show plan with task dependency graph |
| `telesis plan approve <plan-id>` | Transition plan from draft to approved |
| `telesis plan execute <plan-id> [--agent <name>] [--no-validate]` | Execute tasks sequentially |
| `telesis plan retry <plan-id>` | Re-execute from escalated/failed task |
| `telesis plan skip-task <plan-id> <task-id>` | Skip escalated task, resume plan |
| `telesis plan gate-approve <plan-id>` | Approve plan at validation gate |

All ID arguments support prefix matching.

---

## telesis run

Full pipeline orchestration.

```
telesis run <work-item-id> [options]
```

| Flag | Description |
|---|---|
| `--agent <name>` | Select agent |
| `--auto-approve` | Skip plan approval prompt |
| `--no-push` | Skip pushing to remote |
| `--no-validate` | Skip post-task validation |
| `--no-review` | Skip review even if configured |
| `--no-quality-check` | Skip quality gates |
| `--resume` | Auto-resume from partial state without prompting |
| `--restart` | Discard partial state and start fresh |
| `--branch <name>` | Override branch name |

Pipeline stages: `planning` → `awaiting_approval` → `executing` → `quality_check` → `committing` → `pushing` → `creating_pr` → `closing_issue` → `completed`

---

## telesis dispatch

Agent dispatch.

| Command | Description |
|---|---|
| `telesis dispatch run <task> [--agent <name>] [--no-oversight]` | Dispatch a coding agent |
| `telesis dispatch list [--json]` | List dispatch sessions |
| `telesis dispatch show <session-id> [--text]` | Replay session event log (`--text` for narrative reconstruction) |

Session IDs support prefix matching.

---

## telesis daemon

Background daemon management.

| Command | Description |
|---|---|
| `telesis daemon start` | Start the daemon (prints PID) |
| `telesis daemon stop` | Stop the daemon |
| `telesis daemon status` | Show status (PID, uptime, event count, client count) |
| `telesis daemon install` | Install as system service (LaunchAgent/systemd) |
| `telesis daemon tui` | Stream live events to terminal |
