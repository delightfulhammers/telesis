# Telesis — Milestones
*By Delightful Hammers*
*Last updated: 2026-03-10*

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

## v0.2.1 — Document Quality Refinement

**Goal:** Make the init agent's generated documents good enough that a developer can start
building immediately — no significant manual editing needed. Establish a repeatable
evaluation framework to measure document quality and drive prompt improvements with data.

**Status:** Complete

**Reference:** Issues #15–#20

### What Changes

A document quality evaluation suite is introduced to score generated documents across
defined axes (completeness, accuracy, specificity, actionability, consistency). With
measurement in place, the interview and generation prompts are improved to address the
five quality gaps identified during v0.2.0 validation.

### Acceptance Criteria

1. An evaluation suite exists that scores generated documents on defined quality axes
2. The eval suite can run against any set of generated documents and produce a structured
   report
3. Interview context is fully preserved in generated documents — features, constraints,
   and decisions discussed in the interview appear in the output (#18)
4. ARCHITECTURE.md generation does not fabricate implementation details that were not
   discussed in the interview (#17)
5. VISION.md principles are project-specific, derived from the interview conversation,
   not generic boilerplate (#15)
6. Config extraction correctly identifies the primary language/framework from context (#16)
7. PRD includes an explicit out-of-scope section when the interview surfaces out-of-scope
   items (#19)
8. Re-running the tic-tac-toe test case shows measurable improvement on eval scores
   compared to v0.2.0 baseline

### Build Sequence

1. **Phase 1 — Eval suite:** Build the document quality evaluation framework (#20).
   Define scoring axes, implement automated scoring, establish baseline from v0.2.0
   output
2. **Phase 2 — Interview context preservation:** Fix dropped context between interview
   and generation (#18). Ensure all discussed topics flow through to documents
3. **Phase 3 — Generation prompt improvements:** Address over-specification in
   ARCHITECTURE.md (#17), generic VISION.md principles (#15), missing PRD out-of-scope
   (#19)
4. **Phase 4 — Config extraction fix:** Improve language/framework detection in config
   extraction (#16)
5. **Phase 5 — Validation:** Re-run eval suite, compare against baseline, validate all
   acceptance criteria

### Phase 5 Notes

Live validation against the tic-tac-toe test case confirmed all 8 acceptance criteria.
The eval suite scored 72% overall (VISION 100%, PRD 100%, ARCHITECTURE 67%, MILESTONES
87%, Coverage 50%, Consistency 45%). Per-document quality is high; lower global scores
reflect eval suite calibration issues (bigram false negatives in coverage, name comparison
false positive in consistency, numbered-heading mismatch in architecture completeness)
rather than document quality problems.

Qualitative assessment confirmed all five tracked quality issues are resolved:
- #15: Principles are project-specific decision heuristics, not feature labels
- #16: Config extraction prompt instructs language normalization (React → TypeScript)
- #17: Architecture uses only discussed technologies, no fabrication
- #18: Model-assisted topic extraction preserves interview context in generation
- #19: PRD includes detailed Out of Scope section when exclusions are discussed

Three eval suite calibration issues were identified for future refinement: numbered
headings not matched by structural evaluator, bigram coverage producing excessive false
negatives, and name consistency producing false positives.

---

## v0.2.2 — Pricing Provider Key

**Goal:** Key pricing lookup by `{provider, model}` instead of model alone, preventing
incorrect cost attribution if multiple providers share model identifiers.

**Status:** Complete

**Reference:** Issue #9

### What Changes

The `PricingConfig.models` structure changes from a flat `Record<model, ModelPricing>` to
a nested `Record<provider, Record<model, ModelPricing>>`. The `provider` field is removed
from `ModelPricing` (it is now the map key). `calculateCost` looks up pricing by
`pricing.models[record.provider]?.[record.model]`, ensuring records are costed against
their own provider's rates.

### Acceptance Criteria

1. `calculateCost` verifies both provider and model before applying pricing rates
2. Records from an unknown provider contribute zero cost (not matched to another provider)
3. Records from the same model under different providers are costed at their respective rates
4. `pricing.yml` uses a nested `provider → model` YAML structure
5. All existing tests pass with the new structure

---

## v0.3.0 — Drift Detection

**Goal:** Detect when implementation diverges from what the spec documents claim, using
deterministic/structural checks only (no model calls).

**Status:** Complete

**Reference:** Planned milestone

### What Changes

A drift detection subsystem is introduced under `src/drift/`. Six structural checks verify
falsifiable claims from ARCHITECTURE.md and PRD.md: SDK import containment, Commander import
containment, no process.exit in business logic, expected directory structure, test colocation,
and command registration parity between PRD and CLI.

### Acceptance Criteria

1. `telesis drift` runs all registered checks and prints a formatted pass/fail report
2. `telesis drift --check <name>` runs only the named check
3. `telesis drift --json` outputs the report as JSON
4. `sdk-import-containment` detects `@anthropic-ai/sdk` imports outside `src/agent/model/client.ts`
5. `commander-import-containment` detects `commander` imports outside `src/cli/` and `src/index.ts`
6. `no-process-exit` detects `process.exit` calls in business logic packages
7. `test-colocation` identifies source files missing colocated tests
8. `expected-directories` verifies the documented directory structure exists
9. `command-registration` verifies PRD commands match registered CLI commands
10. Running `telesis drift` on the Telesis repo produces zero errors
11. `telesis drift` exits 0 on all-pass, exits 1 on any error-severity finding
12. All drift checks have colocated unit tests

---

## v0.4.0 — Session Insight Capture

**Goal:** Lightweight mechanism for feeding development observations back into project
memory. Notes are too small for an ADR, not a requirement, not a milestone item — but they
prevent future mistakes.

**Status:** Complete

**Reference:** Planned milestone

### What Changes

A `telesis note` command is introduced for capturing development insights into
`.telesis/notes.jsonl`. Notes surface in CLAUDE.md via `telesis context`, grouped by tag.
`telesis status` reports note count.

### Acceptance Criteria

1. `telesis note add "text"` appends a note to `.telesis/notes.jsonl` with UUID, timestamp, and text
2. `telesis note add --tag <tag> "text"` stores the note with the specified tag(s)
3. `telesis note add -` reads note text from stdin
4. `telesis note list` displays all notes in reverse chronological order
5. `telesis note list --tag <tag>` filters notes to those matching the tag
6. `telesis note list --json` outputs notes as a JSON array
7. `telesis context` includes a "Development Notes" section in CLAUDE.md when notes exist
8. Notes in CLAUDE.md are grouped by tag with a "General" group for untagged notes
9. `telesis context` omits the Development Notes section when no notes exist
10. `telesis status` reports note count
11. Write failures to `notes.jsonl` log to stderr and do not abort
12. All new business logic has colocated unit tests
13. Running `telesis drift` on the Telesis repo produces zero errors after all changes

---

## v0.5.0 — Review Agent

**Goal:** Native code review agent that reviews diffs against the project's own spec
documents (architecture, requirements, conventions, decisions) and produces structured
findings. Replaces the need for an external review tool by leveraging what Telesis already
knows about the project.

**Status:** Complete

**Reference:** TDD-003 (Review Agent)

### What Changes

A review agent is introduced under `src/agent/review/`. It accepts a diff (staged changes,
branch diff, or commit range), assembles review criteria dynamically from project documents,
sends the diff + criteria to the model, and produces structured findings with severity,
category, file location, and suggestion. Review sessions are stored in `.telesis/reviews/`
as per-session JSONL files.

### Acceptance Criteria

1. `telesis review` reviews staged changes and prints a formatted findings report
2. `telesis review --all` reviews working + staged changes
3. `telesis review --ref <ref>` reviews diff against the specified ref
4. `telesis review --json` outputs the review as JSON
5. `telesis review --min-severity <level>` filters findings by severity
6. `telesis review --list` lists past review sessions
7. `telesis review --show <id>` shows findings from a past session
8. Empty diff prints a message and exits 0 (no model call)
9. Review criteria are assembled dynamically from project documents (zero configuration)
10. Findings include severity, category, file path, line range, description, and suggestion
11. Review sessions are stored in `.telesis/reviews/<session-id>.jsonl`
12. Malformed model responses produce a warning, not a crash
13. All new business logic has colocated unit tests
14. Running `telesis drift` on the Telesis repo produces zero errors after all changes

### Implementation Notes

The review agent went through four rounds of Bop code review on PR #33, with each round
improving security and robustness:

- **Round 1:** Self-review found 12 issues; 6 fixed (hardcoded model name, falsy line-0
  check, non-atomic writes, late validation, shell injection via `execSync`, duplicate
  severity constants)
- **Round 2:** Security hardening — UUID validation on session IDs (path traversal
  prevention), git option injection prevention (safe ref allowlist), first-line-only session
  listing, maxBuffer on all git commands
- **Round 3:** Newline-missing edge case in session listing, redundant `content.split('\n')`
  elimination, line number validation on model output (positive integers, coherent ranges),
  robust fence stripping with capture group regex, descriptive JSON.parse errors, PRD
  Commands section added to review context
- **Round 4:** Exit code based on unfiltered findings (not display-filtered subset),
  unanchored regex for fence extraction to handle model preamble/postamble

---

## Future Milestones

*(Tracked here as direction, not commitment.)*

- **v0.6.0 — Review Personas:** Multi-perspective review with persona-based lenses and
  cross-round deduplication (informed by Bop's three-stage dedup architecture)
- **v1.0.0 — Swarm Orchestration:** Multi-agent coordination across the development
  lifecycle