# Telesis — Milestones
*By Delightful Hammers*
*Last updated: 2026-03-08*

---

## MVP v0.1.0

**Goal:** The shortest path to using Telesis to develop Telesis.

**Status:** In Progress — Phase 0 (scaffolding)

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

The generated `CLAUDE.md` template must reach parity with the hand-written bootstrap version before it can replace it. Sections currently in the hand-written CLAUDE.md that the template does not yet generate:

- Working Conventions (language/runtime, package discipline, error handling, testing, file generation, ADR discipline, PR expectations, scope discipline)
- Relationship to Bop
- "What On Track Looks Like" guidance

These sections contain critical guidance for Claude Code sessions. The template should either extract them from `docs/ARCHITECTURE.md` and `docs/VISION.md`, or support a freeform "additional context" section in the config. This must be resolved before acceptance criterion #7 can be considered fully met.

---

## Future Milestones

*(Out of scope for MVP. Tracked here as direction, not commitment.)*

- **v0.2.0 — Interactive Init:** Interview-driven `telesis init` with guided prompts
- **v0.3.0 — Drift Detection:** Compare implementation against spec, flag divergence
- **v0.4.0 — Session Insight Capture:** Lightweight mechanism for feeding development observations back into project memory (see VISION.md, "The Insight Gap")
- **v0.5.0 — Bop Integration:** ACP server interface, Telesis-driven code review
- **v1.0.0 — Swarm Orchestration:** Multi-agent coordination across the development lifecycle
