# Telesis — Product Requirements
*By Delightful Hammers*
*Draft: 2026-03-07*

---

## Goal

The shortest path to using Telesis to develop Telesis.

A CLI tool that initializes and maintains a structured project context layer — the persistent memory and intent layer that keeps Claude Code sessions coherent across time, sessions, and contributors.

---

## What It Is

A TypeScript CLI (compiled to a single binary with Bun) that manages a structured project context — living documents, drift detection, code review, and development memory — and generates a `CLAUDE.md` injection file that keeps AI coding agents aligned with project intent.

---

## Document Structure

`telesis init` creates the following in the project repo:

```
docs/
  VISION.md          ← the "what and why" (foundation doc)
  PRD.md             ← requirements + user journeys + implicit requirements
  ARCHITECTURE.md    ← high-level system design + component overview
  MILESTONES.md      ← checkpoints with explicit acceptance criteria
  adr/               ← architectural decision records (ADR-NNN-slug.md)
  tdd/               ← technical design docs per component (TDD-NNN-slug.md)
.telesis/
  config.yml         ← project metadata (name, owner, languages, status)
CLAUDE.md            ← generated; stitches context together for Claude Code
```

---

## Commands

### `telesis init`

Initializes a new project context in the current repo.

- Gathers project metadata: name, owner, purpose, primary language(s), key constraints
- Generates `VISION.md` skeleton from input
- Creates empty skeletons for PRD, ARCHITECTURE, MILESTONES
- Creates `docs/adr/` and `docs/tdd/` directories with README stubs
- Creates `.telesis/config.yml`
- Generates initial `CLAUDE.md`

### `telesis context`

Regenerates `CLAUDE.md` from current document state.

- Reads all docs in the standard structure
- Produces a formatted `CLAUDE.md` that Claude Code can consume
- Includes: current phase/status, active milestones, recent ADRs, pointers to key docs
- Idempotent — safe to run any time

### `telesis adr new <slug>`

Creates a new ADR from template.

- Assigns next sequential number
- Opens with standard ADR template (status, context, decision, consequences)
- Example: `telesis adr new use-nats-for-events` → `docs/adr/ADR-{NNN}-use-nats-for-events.md`

### `telesis tdd new <slug>`

Creates a new TDD from template.

- Assigns next sequential number
- Opens with standard TDD template (overview, components, interfaces, data model, open questions)

### `telesis status`

Prints current project state: active milestone, ADR count, TDD count, last context regeneration.

### `telesis eval`

Evaluates quality of generated project documents.

- Runs structural, specificity, actionability, coverage, and consistency evaluators
- Reports per-document and overall scores
- `--json` outputs the report as JSON

### `telesis drift`

Detects drift between spec documents and implementation.

- Runs all registered drift checks and prints a formatted pass/fail report
- `--check <name>` runs only the named check(s)
- `--json` outputs the report as JSON
- `--github-pr` posts drift results as a PR comment (idempotent — updates existing comment on subsequent pushes)
- Exits 0 on all-pass, exits 1 on any error-severity finding

### `telesis note`

Manages lightweight development notes (session insights, gotchas, conventions too small for an ADR).

- `telesis note add "text"` appends a note to `.telesis/notes.jsonl`
- `telesis note add --tag <tag> "text"` stores the note with tag(s)
- `telesis note add -` reads note text from stdin
- `telesis note list` displays all notes, newest first
- `telesis note list --tag <tag>` filters by tag
- `telesis note list --json` outputs notes as JSON
- Notes surface in CLAUDE.md via `telesis context` (grouped by tag)

### `telesis review`

Reviews code changes against project conventions, architecture rules, and design decisions.

- `telesis review` runs persona-based multi-perspective review by default
- `telesis review --single` runs the generalist single-pass review mode
- `telesis review --all` reviews working + staged changes
- `telesis review --ref <ref>` reviews diff against a ref (e.g., main, main...HEAD)
- `telesis review --personas <slugs>` runs only the named personas (comma-separated)
- `telesis review --no-dedup` skips within-session deduplication across personas
- `telesis review --no-themes` skips cross-round theme extraction from prior sessions
- `telesis review --json` outputs findings as JSON (includes persona and dedup metadata)
- `telesis review --min-severity <level>` filters findings by minimum severity
- `telesis review --list` lists past review sessions
- `telesis review --show <id>` shows findings from a past session
- `telesis review --github-pr` posts findings as inline PR review comments on GitHub
- Built-in personas: security, architecture, correctness (zero configuration required)
- Orchestrator selects personas based on diff content and file types
- Findings include severity, category, file path, line range, description, suggestion, and persona
- Duplicate findings across personas are merged, keeping highest severity
- Cross-round themes from prior sessions suppress repeat findings with structured conclusions
- Prior findings from recent sessions injected into prompts for concrete suppression
- Findings include model-assessed confidence (0-100); low-confidence findings are filtered by severity-specific thresholds
- Full-file verification pass reads source files to filter false positives (`--no-verify` to skip)
- Deterministic noise filter removes hedging, self-dismissing, and speculative findings
- Cross-round convergence detection: findings labeled as new, persistent, or resolved across review rounds
- Convergence summary displayed after each round when prior sessions for the same ref exist
- Plateau detection: recommends stopping when 80%+ of findings are recurring (round 3+)
- Findings display `[new]` or `[recurring]` labels in output (round 2+, omitted from `--show` and `--json`)
- Stale themes filtered from display — only themes matching current findings are shown
- Theme extraction deduplicates sessions by ref to exclude resolved findings
- Review sessions stored in `.telesis/reviews/`
- Personas configurable via `.telesis/config.yml` `review.personas` section
- Exits with code 1 when critical or high severity findings are present
- `telesis review dismiss <id> --reason <category>` dismisses a finding (false-positive, not-actionable, already-addressed, style-preference)
- `telesis review dismiss <id> --reason <category> --note <text>` dismisses with optional note
- `telesis review dismissals` lists all dismissals
- `telesis review dismissals --json` outputs dismissals as JSON
- `telesis review sync-dismissals --pr <N>` imports dismissal signals from GitHub PR review threads
- `telesis review dismissal-stats` shows aggregated dismissal statistics and candidate noise patterns
- `telesis review dismissal-stats --json` outputs stats as JSON
- `telesis review sync-replies --pr <N>` posts unsynced dismissal replies to GitHub PR threads
- Dismissed findings persisted in `.telesis/dismissals.jsonl` (cross-session, append-only)
- Dismissed findings injected into review prompts as strongest suppression signal (capped at 50)
- Post-review fuzzy matching filters re-raises of dismissed findings (deterministic + LLM judge)
- Finding ID markers embedded in GitHub review comments for correlation during sync
- Review cost tracking in PR comments and local output

### `telesis journal`

Design journal for exploratory thinking — observations, emerging ideas, and design
explorations that haven't crystallized into ADRs or TDDs yet.

- `telesis journal add <title> <body>` adds a dated journal entry
- `telesis journal list` lists all entries by date and title (reverse chronological)
- `telesis journal list --json` outputs entries as JSON
- `telesis journal show <query>` displays an entry by ID, date, or title substring
- Entries persisted in `.telesis/journal.jsonl` (append-only JSONL)
- Recent entries surface in `telesis context` output (3 most recent titles)

### `telesis daemon`

Manages the Telesis daemon — a long-running background process that watches the project
filesystem and maintains a reactive event backbone for future agent orchestration.

- `telesis daemon start` starts the daemon as a background process
- `telesis daemon stop` gracefully shuts down the daemon
- `telesis daemon status` reports whether the daemon is running, PID, uptime, event count
- `telesis daemon install` configures OS-level supervision (LaunchAgent on macOS, systemd on Linux)
- `telesis daemon tui` connects to the daemon and streams live events to the terminal
- The daemon watches the project directory for file changes and emits typed events
- Events use a discriminated union format: `{ type, timestamp, source, payload }`
- A Unix socket (`.telesis/daemon.sock`) serves as the IPC interface (NDJSON protocol)
- PID file (`.telesis/daemon.pid`) prevents duplicate instances
- The daemon survives terminal close when installed via OS supervision

### `telesis dispatch`

Dispatches coding agents via ACP (Agent Client Protocol) to execute development tasks.

- `telesis dispatch run <task>` dispatches a coding agent with the given task description
- `telesis dispatch run --agent <name>` selects a specific agent (claude, codex, gemini, etc.)
- `telesis dispatch run --no-oversight` disables oversight observers for this session
- `telesis dispatch list` lists all dispatch sessions (active and completed)
- `telesis dispatch list --json` outputs sessions as JSON
- `telesis dispatch show <session-id>` replays a session's event log (supports ID prefix)
- `telesis dispatch show <session-id> --text` reconstructs and displays the full agent output as readable text
- The dispatcher supplies the agent with project context (spec, architecture, conventions)
- Agent sessions are persisted in `.telesis/sessions/` (meta.json + events.jsonl per session)
- Agent events stream through the daemon event backbone when the daemon is running
- Bounded concurrency limits simultaneous agents (configurable via `dispatch.maxConcurrent`, default 3)
- Agent crashes are detected and reported, not silently swallowed
- Oversight observers (reviewer, architect, chronicler) monitor sessions when policy files
  exist in `.telesis/agents/`. Configure autonomy level (observe/alert/intervene) per observer.
- The chronicler automatically extracts development insights from completed sessions as notes
- Oversight findings appear as `oversight:*` events in the TUI and daemon event stream

### `telesis intake`

Imports work from external sources and routes it through the dispatch pipeline.

- `telesis intake github` imports open issues from the configured GitHub repo
- `telesis intake list` lists pending work items
- `telesis intake list --all` lists all work items (including completed, skipped)
- `telesis intake list --json` outputs work items as JSON
- `telesis intake show <id>` shows detailed view of a work item (supports ID prefix)
- `telesis intake approve <id>` approves a work item and dispatches it to a coding agent
- `telesis intake approve <id> --agent <name>` dispatches with a specific agent
- `telesis intake approve <id> --plan` creates a plan instead of dispatching directly
- `telesis intake skip <id>` marks a work item as skipped
- Work items are persisted in `.telesis/intake/` as per-item JSON files
- Deduplication prevents re-importing issues already in the store
- Configurable via `intake.github` in `.telesis/config.yml` (labels, excludeLabels, assignee, state)
- Intake events flow through the daemon event backbone as `intake:*` events
- The `IntakeSource` adapter interface enables future platform adapters (Linear, Jira)

### `telesis plan`

Decomposes work items into sequenced, dispatchable task plans.

- `telesis plan create <work-item-id>` decomposes a work item into tasks via LLM
- `telesis plan list` lists non-completed plans
- `telesis plan list --all` lists all plans
- `telesis plan list --json` outputs plans as JSON
- `telesis plan show <plan-id>` shows plan detail with task dependency graph (supports ID prefix)
- `telesis plan approve <plan-id>` transitions a plan from draft to approved
- `telesis plan execute <plan-id>` dispatches tasks with validation (default)
- `telesis plan execute <plan-id> --agent <name>` executes with a specific agent
- `telesis plan execute <plan-id> --no-validate` skips the validation loop
- `telesis plan retry <plan-id>` re-executes from escalated/failed task
- `telesis plan skip-task <plan-id> <task-id>` skips an escalated task, resumes plan
- `telesis plan gate-approve <plan-id>` transitions awaiting_gate → completed
- Plans are persisted in `.telesis/plans/` as per-plan JSON files
- Tasks have dependency relationships validated by topological sort (Kahn's algorithm)
- Plan lifecycle: `draft` → `approved` → `executing` → `completed`/`failed`/`escalated`/`awaiting_gate`
- Crash recovery: re-executing a failed/escalated plan skips completed tasks and resumes
- After dispatch, a validation agent checks task output against acceptance criteria
- Failed validation triggers automatic correction retries (configurable, default 3)
- Exhausted retries escalate the task for human review
- Milestone gates (`enableGates: true`) pause for human approval after all tasks complete
- Plan and validation events flow through the daemon event backbone
- Configurable via `planner` and `validation` in `.telesis/config.yml`

### `telesis run`

Full pipeline orchestration from work item to committed code.

- `telesis run <work-item-id>` runs the full pipeline: plan → execute → validate → commit → push
- `telesis run <work-item-id> --agent <name>` selects a specific agent
- `telesis run <work-item-id> --auto-approve` skips interactive plan confirmation
- `telesis run <work-item-id> --no-push` skips push after commit
- `telesis run <work-item-id> --no-validate` skips the validation loop
- `telesis run <work-item-id> --branch <name>` overrides the auto-generated branch name
- Pipeline stages: planning → approval → executing → committing → pushing → creating_pr → closing_issue → completed
- Interactive plan approval gate (unless `--auto-approve` or `pipeline.autoApprove` config)
- Configurable git behavior via `git` section in `.telesis/config.yml`:
  - `branchPrefix` (default: `telesis/`) — prefix for auto-created branches
  - `commitToMain` (default: false) — skip branching, commit directly to current branch
  - `pushAfterCommit` (default: true) — auto-push after commit
  - `createPR` (default: false) — create PR after push (requires `GITHUB_TOKEN`)
- Configurable pipeline behavior via `pipeline` section in `.telesis/config.yml`:
  - `autoApprove` (default: false) — skip plan confirmation prompt
  - `closeIssue` (default: false) — close source GitHub issue on completion
- Pipeline events flow through the daemon event backbone
- One commit per plan — agent commits squashed into a single pipeline commit
- LLM-generated commit messages from diff + plan context
- LLM-generated PR body descriptions
- Pipeline state persisted to `.telesis/pipeline-state/` for crash recovery and resumability
- Configurable quality gates run before push (format, lint, test, build, drift, review)
- Quality gates amend the commit when formatters modify files
- Quality gates configurable via `pipeline.qualityGates` in `.telesis/config.yml`

### `telesis milestone`

Milestone validation and completion.

- `telesis milestone check` validates the active milestone is ready for completion
- Runs automated checks: drift clean, tests pass, build succeeds, lint passes
- Lists acceptance criteria from the milestone for manual confirmation
- Exits with code 1 when any automated check fails
- `telesis milestone complete` runs checks first, then marks the milestone done
- Completion automates: set MILESTONES.md status to Complete, bump package.json version,
  update referenced TDD statuses to Accepted, regenerate CLAUDE.md
- Does not auto-commit; prints remaining manual steps (PRD/ARCHITECTURE updates, commit, tag)

### `telesis orchestrator`

Orchestrator state management and human decision interface.

- `telesis orchestrator status` — shows current orchestrator state, active milestone,
  progress, and pending decisions
- `telesis orchestrator approve <decision-id>` — approve a pending decision
- `telesis orchestrator reject <decision-id> --reason "..."` — reject with feedback
- `telesis orchestrator run` — advance the state machine until a decision point or idle
- `telesis orchestrator preflight` — run preflight checks (used by Claude Code hooks to
  gate git commit/push operations)
- `telesis orchestrator resume-briefing` — generate a structured orientation for resuming
  after a session boundary (inspects orchestrator state, git workspace, session history)
- Preflight checks: milestone entry exists, review has converged, quality gates pass,
  no blocking decisions pending
- Exit code 1 on preflight failure (blocks the hook)
- Session tracking: orchestrator records session ID, start time, exit reason for each
  execution attempt; resume briefing produces recovery recommendations
- Daemon session reactor: subscribes to dispatch lifecycle events, maps exit reasons,
  applies configurable restart policy (auto-restart, notify-only, manual)
- Configurable via `daemon.sessionLifecycle` in `.telesis/config.yml`: restartPolicy,
  cooldownSeconds, maxRestartsPerMilestone
- Circuit breaker: auto-restart stops after maxRestartsPerMilestone (default 10)
- Status command shows dispatch session history for the current milestone
- Claude Code hook installed: `PreToolUse(Bash)` gates git commit on preflight

### `telesis hooks`

Provider-neutral git hook management.

- `telesis hooks install` — install git pre-commit hook that runs preflight checks
- `telesis hooks uninstall` — remove telesis git hook
- Git hooks coexist with Claude Code hooks (marker file dedup)
- Works with any agent — no Claude Code dependency required

### MCP Guidance Resources

Contextual guidance served as MCP resources for any MCP-compatible client.

- Skills content from `.claude/skills/*/SKILL.md` served as `telesis://guidance/{name}`
- Any MCP client can read guidance resources for the same context Claude Code skills provide
- Resources re-read at request time to serve current content

### `telesis update`

Self-update mechanism.

- `telesis update` — check for latest release and install if available
- `telesis update --check` — check for updates without installing
- Downloads platform-specific binary from GitHub Releases
- Replaces both `telesis` and `telesis-mcp` binaries
- Daemon checks for updates daily and notifies via OS notification

### `telesis-mcp` (MCP Server)

Separate binary that exposes all Telesis capabilities as MCP (Model Context Protocol) tools
and resources over stdio.

- Compiled alongside the CLI: `bun build src/mcp-server.ts --compile --outfile telesis-mcp`
- 22 MCP tools covering all operations: status, drift, context, ADR, TDD, journal, notes,
  milestone, intake, plan, dispatch, review
- 6 MCP resources for project documents: VISION.md, PRD.md, ARCHITECTURE.md, MILESTONES.md,
  CLAUDE.md, config
- Configure in Claude Code's `.mcp.json`:
  ```json
  { "mcpServers": { "telesis": { "command": "/path/to/telesis-mcp" } } }
  ```
- All tools accept an optional `projectRoot` parameter to override the working directory
- LLM-powered tools (`telesis_review`) note cost/duration in their descriptions
- `telesis_milestone_complete` performs local file updates only — git operations are manual
- Input validation via Zod schemas (slug patterns, length caps, path traversal prevention)

---

## CLAUDE.md Format

Generated file. Not hand-edited. Regenerated by `telesis context`.

```markdown
# <Project Name> — Claude Context
*Generated by Telesis on <date>*

## Project
<name, owner, status, primary language>

## Quick Start
1. Read docs/VISION.md for the foundational why
2. Read docs/PRD.md for requirements and user journeys
3. Read docs/ARCHITECTURE.md for system design
4. Current milestone: <milestone name + acceptance criteria>

## Active Milestone
<milestone name>
<acceptance criteria>
<completion status>

## Recent Decisions
<last 5 ADRs with one-line summaries>

## Key Documents
- Vision: docs/VISION.md
- PRD: docs/PRD.md
- Architecture: docs/ARCHITECTURE.md
- Milestones: docs/MILESTONES.md
- ADRs: docs/adr/ (<n> decisions on record)
- TDDs: docs/tdd/ (<n> component designs)

## Principles
<extracted from VISION.md design principles section>
```

---

## Explicitly Out of Scope

- Swarm orchestration (multi-agent coordination beyond review personas)
- Linear / Jira integrations (GitHub intake added in v0.15.0)
- Web UI
- Multi-project management
- Authentication / teams

---

## Self-Hosting

Telesis is developed using Telesis. The project context, drift checks, code review, and development notes are all managed by the tool itself. This self-hosting validates the tool's utility and surfaces gaps in its own capabilities.
