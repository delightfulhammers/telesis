---
title: CLI Reference
description: Every command, flag, and option
weight: 200
---

# CLI Reference

Complete reference for all Telesis CLI commands.

## telesis init

Unified project onboarding — auto-detects greenfield, existing docs, or version migration.

```
telesis init [--docs <path>]
```

| Flag | Description |
|---|---|
| `--docs <path>` | Custom docs directory (default: `docs/`) |

**Modes:**
- **Greenfield** (no `.telesis/`, no docs): AI interview + doc generation. Requires `ANTHROPIC_API_KEY`.
- **Existing project** (docs exist, no `.telesis/`): ingests docs, creates config, scaffolds.
- **Migration** (`.telesis/` exists): retrofits missing scaffold artifacts.

Idempotent — safe to run repeatedly. Replaces the former `telesis upgrade` command (removed in v0.31.0).

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

---

## telesis orchestrator

Orchestrator lifecycle management.

| Command | Description |
|---|---|
| `telesis orchestrator status` | Show orchestrator state, active milestone, and pending decisions |
| `telesis orchestrator run` | Advance the state machine until a decision point or idle |
| `telesis orchestrator approve <id> [--items ...] [--milestone-name ...] [--milestone-id ...] [--goal ...]` | Approve a decision (triage flags set milestone metadata) |
| `telesis orchestrator reject <decision-id> --reason <text>` | Reject a decision with feedback |
| `telesis orchestrator preflight` | Run preflight checks (used by hooks) |
| `telesis orchestrator resume-briefing` | Generate structured orientation for resuming after a session boundary |

Decision IDs support prefix matching (8+ characters). Triage approval accepts `--items` (comma-separated IDs), `--milestone-name`, `--milestone-id`, and `--goal` to configure the milestone scope.

Preflight checks: milestone entry exists, review has converged, quality gates pass, no blocking decisions pending. Exits 1 on failure.

Resume briefing inspects orchestrator state, git workspace, and session history to produce a recovery recommendation.

---

## telesis hooks

Provider-neutral git hook management.

| Command | Description |
|---|---|
| `telesis hooks install` | Install git pre-commit hook that runs preflight checks |
| `telesis hooks uninstall` | Remove telesis git pre-commit hook |

The git hook coexists with Claude Code hooks — defers if Claude Code already ran preflight. Appends to existing hooks without overwriting. Idempotent.

---

## telesis update

Self-update.

| Command | Description |
|---|---|
| `telesis update` | Download and install the latest version |
| `telesis update --check` | Check for updates without installing |

Downloads platform-specific binaries from GitHub Releases. Replaces both `telesis` and `telesis-mcp`.

---

## telesis-mcp

MCP server binary (separate from the CLI).

```
telesis-mcp
```

Starts a stdio MCP server exposing 28 tools and 6+ resources. Intended for use with Claude Code or other MCP clients.

**Tools:** `telesis_status`, `telesis_drift`, `telesis_context_generate`, `telesis_adr_new`, `telesis_tdd_new`, `telesis_journal_add`, `telesis_journal_list`, `telesis_journal_show`, `telesis_note_add`, `telesis_note_list`, `telesis_milestone_check`, `telesis_milestone_complete`, `telesis_intake_list`, `telesis_intake_show`, `telesis_plan_list`, `telesis_plan_show`, `telesis_plan_approve`, `telesis_dispatch_list`, `telesis_dispatch_show`, `telesis_review`, `telesis_review_list`, `telesis_review_show`, `telesis_orchestrator_status`, `telesis_orchestrator_run`, `telesis_orchestrator_approve`, `telesis_orchestrator_reject`, `telesis_orchestrator_preflight`, `telesis_orchestrator_resume_briefing`

**Resources:** `telesis://docs/VISION.md`, `telesis://docs/PRD.md`, `telesis://docs/ARCHITECTURE.md`, `telesis://docs/MILESTONES.md`, `telesis://CLAUDE.md`, `telesis://config`, `telesis://guidance/*` (one per installed skill)

Configure in Claude Code:
```json
{ "mcpServers": { "telesis": { "command": "/path/to/telesis-mcp" } } }
```

All tools accept an optional `projectRoot` parameter to override the working directory. LLM-powered tools note cost/duration in their descriptions.
