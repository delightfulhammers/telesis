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
  config.yml         ← project metadata (name, owner, language, status)
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
- Example: `telesis adr new use-nats-for-events` → `docs/adr/ADR-012-use-nats-for-events.md`

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
- Built-in personas: security, architecture, correctness (zero configuration required)
- Orchestrator selects personas based on diff content and file types
- Findings include severity, category, file path, line range, description, suggestion, and persona
- Duplicate findings across personas are merged, keeping highest severity
- Cross-round themes from prior sessions suppress repeat findings
- Review sessions stored in `.telesis/reviews/`
- Personas configurable via `.telesis/config.yml` `review.personas` section
- Exits with code 1 when critical or high severity findings are present

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
- GitHub / Linear / Jira integrations
- Web UI
- Multi-project management
- Authentication / teams

---

## Self-Hosting

Telesis is developed using Telesis. The project context, drift checks, code review, and development notes are all managed by the tool itself. This self-hosting validates the tool's utility and surfaces gaps in its own capabilities.
