# Telesis — Milestones
*By Delightful Hammers*
*Last updated: 2026-03-09*

---

## MVP v0.1.0

**Goal:** The shortest path to using Telesis to develop Telesis.

**Status:** Complete

### Acceptance Criteria

1. `telesis init` produces the full document structure
2. `telesis context` generates a valid `CLAUDE.md` from existing docs
3. `telesis adr new <slug>` creates a correctly numbered ADR
4. `telesis tdd new <slug>` creates a correctly numbered TDD
5. `telesis status` prints current project state
6. The Telesis repo itself is initialized with `telesis init`
7. Claude Code sessions on the Telesis repo use the generated `CLAUDE.md`
8. Bop reviews at least one PR on the Telesis repo

### Build Sequence

1. **Phase 0 — Foundation:** Docs, Go module init, project structure
2. **Phase 1 — Core plumbing:** `internal/config` + `internal/context` + `internal/cli` (root + context commands)
3. **Phase 2 — Scaffold:** `internal/scaffold` + init command
4. **Phase 3 — ADR/TDD tooling:** `internal/adr` + `internal/tdd` + commands
5. **Phase 4 — Status:** `internal/status` + status command
6. **Phase 5 — Self-hosting:** Run Telesis on itself, validate all acceptance criteria

### Phase 5 Notes

Template parity was achieved by introducing `docs/context/` — freeform markdown files that are included verbatim in the generated `CLAUDE.md`. The three sections that were missing from the template (Working Conventions, Relationship to Bop, What On Track Looks Like) now live in `docs/context/` and are included automatically by `telesis context`.

---

## v0.2.0 — AI-Powered Init

**Goal:** Cross the line from plain CLI tool to development intelligence platform. Replace
the flags-only `telesis init` with a conversational agent that interviews the developer
and generates substantive first-draft project documents from that conversation.

**Status:** Complete

**Reference:** TDD-001 (Init Agent), ADR-001 (TypeScript agent layer), ADR-002 (TypeScript rewrite)

### What Changes

The CLI has been rewritten from Go to TypeScript/Bun (ADR-002). The agent layer lives
under `src/agent/` within the unified codebase — no subprocess boundary, direct function
calls. The `telesis init` experience becomes: run the agent, answer questions, receive
real documents — not skeletons.

### Acceptance Criteria

1. `telesis init` launches the TypeScript init agent and conducts a conversational
   interview with the developer
2. The interview collects all required project context: name, owner, purpose, primary
   language(s), constraints, success criteria, architecture hints, out-of-scope items
3. The agent generates substantive (non-skeleton) first-draft versions of VISION.md,
   PRD.md, ARCHITECTURE.md, and MILESTONES.md from the interview
4. The agent writes `.telesis/config.yml` from collected metadata
5. The agent invokes `telesis context` to produce the initial `CLAUDE.md`
6. Every model call is logged to `.telesis/telemetry.jsonl` with token counts and
   duration
7. `telesis status` reports total tokens used and estimated cost from telemetry
8. The agent creates `.telesis/pricing.yml` with current model pricing on first run
9. A new project initialized with the v0.2.0 `telesis init` produces documents
   good enough to begin development without significant manual editing
10. Bop reviews at least one PR on the Telesis repo during this milestone

### Build Sequence

1. **Phase 1 — Model client + telemetry:** `ModelClient` abstraction, JSONL telemetry
   logger, `pricing.yml` bootstrap
2. **Phase 2 — Interview engine:** conversation loop, state serialization, system prompt
3. **Phase 3 — Document generator:** per-document generation calls, generation prompts,
   sequential generation with accumulated context
4. **Phase 4 — CLI integration:** wire `telesis init` to invoke the agent, call
   `context.generate()` directly to produce CLAUDE.md, summary output
5. **Phase 5 — Status integration:** update `telesis status` to read telemetry and
   report token usage and estimated cost
6. **Phase 6 — Validation:** initialize a real project with the agent, evaluate document
   quality, validate all acceptance criteria

*Note: Phase 0 (agent scaffold) from the original plan was absorbed by the TypeScript
rewrite (ADR-002), which unified the codebase under `src/` — no separate `agent/`
directory or workspace configuration needed.*

### Phase 6 Notes

Live validation against a sample project (tic-tac-toe webapp) confirmed all 10 acceptance
criteria. Three runtime bugs were found and fixed during live testing: empty messages array
on first API call, `finalMessage()` unavailable on raw SDK stream, and config extraction
failing when project name not explicitly stated.

Document quality assessment identified five areas for improvement, tracked as issues #15–#19:
generic VISION.md principles, incorrect language normalization (React vs TypeScript),
ARCHITECTURE.md over-specifying undiscussed implementation details, interview context
dropped from generated docs, and missing out-of-scope section in PRD. Issue #20 tracks
building an evaluation suite to measure document quality systematically.

---

## Future Milestones

*(Tracked here as direction, not commitment.)*

- **v0.3.0 — Drift Detection:** Compare implementation against spec; flag divergence
- **v0.4.0 — Session Insight Capture:** Lightweight mechanism for feeding development
  observations back into project memory (see VISION.md, "The Insight Gap")
- **v0.5.0 — Bop Integration:** ACP server interface, Telesis-driven code review
- **v1.0.0 — Swarm Orchestration:** Multi-agent coordination across the development
  lifecycle