# Telesis — Milestones
*By Delightful Hammers*
*Last updated: 2026-03-16*

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

## v0.5.1 — Housekeeping

**Goal:** Close open issues from review feedback, harden drift detection and review context
assembly.

**Status:** Complete

**Reference:** Issues #30, #32, #34; PR #35 (4 rounds of Bop review)

### What Changes

Three open issues are resolved and several robustness improvements are made based on Bop
code review feedback across four rounds.

### Changes

- **#30 — Shared drift scan context:** `ScanContext` (from TDD-002) caches the filesystem
  walk once and filters in-memory per drift check. All four file-scanning checks accept
  optional context with standalone fallback. Trailing-slash normalization on exclude entries.
  `rootDir` resolved to absolute path for consistency.
- **#32 — Structured JSONL reader results:** `loadNotes` and `loadTelemetryRecords` return
  `{ items, invalidLineCount }` so callers can surface data corruption. Removed inaccurate
  `countNotes` (counted malformed lines as valid); status uses `loadNotes().items.length`.
- **#34 — Review conventions size cap:** Conventions truncated at 50K chars with metadata
  returned to caller (not stderr). PRD Commands section extracted into review context.
  Surrogate-pair-safe truncation to avoid invalid UTF-16 at boundary.
- **#36 — Tracked:** Streaming telemetry reader for large JSONL files (deferred, larger scope).

---

## v0.6.0 — Review Personas

**Goal:** Multi-perspective review with specialized personas that focus on distinct
concerns, within-session deduplication, and cross-round theme suppression. Transform the
single-pass reviewer into an orchestrated panel of focused experts.

**Status:** Complete

**Reference:** TDD-004 (Review Personas), Bop (prior art)

### What Changes

The review agent gains persona-based review as the default mode. An orchestrator selects
which personas to engage based on the diff and project context. Selected personas review
in parallel with focused system prompts. Findings are deduplicated across personas within
a session, and themes from prior sessions suppress repeat findings.

### Acceptance Criteria

1. `telesis review` runs persona-based review by default with built-in personas
2. `telesis review --single` runs the generalist single-pass review mode
3. `telesis review --personas sec,arch` runs only the named personas
4. `telesis review --no-dedup` skips within-session deduplication
5. `telesis review --no-themes` skips cross-round theme extraction
6. The orchestrator selects personas based on diff content and project context
7. Persona calls execute in parallel
8. Findings include the `persona` field identifying which persona produced them
9. Duplicate findings across personas are merged, keeping the highest severity
10. The dedup merge count is displayed in the report summary
11. Cross-round themes from the 3 most recent sessions are injected into persona prompts
12. Session metadata records mode, personas used, and themes injected
13. The report groups findings by persona in persona mode
14. Personas are configurable via `.telesis/config.yml` `review.personas` section
15. Default personas work with zero configuration
16. `telesis review --json` includes persona and dedup metadata
17. All new business logic has colocated unit tests
18. Running `telesis drift` on the Telesis repo produces zero errors after all changes

### Build Sequence

1. **Phase 1 — Types and persona definitions**
2. **Phase 2 — Persona-specific prompts**
3. **Phase 3 — Persona orchestrator and parallel execution**
4. **Phase 4 — Within-session deduplication**
5. **Phase 5 — Cross-round theme extraction**
6. **Phase 6 — CLI integration and formatter**
7. **Phase 7 — Config integration and validation**

---

## v0.7.0 — Enforcement Loop

**Goal:** Make Telesis actively verify its own consistency. Expand drift detection to catch
stale docs, missing post-milestone steps, and convention violations that currently rely on
human memory.

**Status:** Complete

### What Changes

Drift detection gains content-aware checks: stale references in living docs, milestone
status inconsistencies, missing context regeneration. The post-code-change and
post-milestone checklists become verifiable, not just documented.

### Acceptance Criteria

1. `telesis drift` detects stale external references in living docs (e.g., outdated tool names, broken links)
2. `telesis drift` warns when CLAUDE.md is out of date relative to source docs
3. `telesis drift` warns when a milestone is marked "Complete" but its TDD is still "Draft"
4. `telesis drift` warns when new CLI commands exist in code but not in PRD.md
5. New drift checks have colocated unit tests
6. Running `telesis drift` on the Telesis repo produces zero errors after all changes

---

## v0.8.0 — CI Integration

**Goal:** Make `telesis review` and `telesis drift` run automatically on pull requests via
GitHub Actions, closing the loop between local development and shared review.

**Status:** Complete

**Reference:** TDD-005 (GitHub Integration), PR #39 (5 rounds of self-review)

### What Changes

A GitHub Actions workflow runs `telesis drift` and `telesis review` on every PR. Results
are posted as PR comments or check annotations. The review agent replaces Bop as the
primary PR reviewer for this repo.

A new `src/github/` package handles all GitHub API interaction: PR context detection,
finding-to-review mapping, comment formatting, and raw fetch wrappers. The CLI gains
`--github-pr` flags on both `telesis review` and `telesis drift`.

### Acceptance Criteria

1. A GitHub Actions workflow runs `telesis drift` on every PR
2. A GitHub Actions workflow runs `telesis review --ref origin/main...HEAD` on every PR
3. Drift failures block PR merge (required check)
4. Review findings are posted as PR comments or check annotations
5. The workflow is self-contained (no external tool dependencies beyond Telesis itself)
6. The Telesis repo uses this workflow as its primary review mechanism

### Implementation Notes

The v0.8.0 PR went through 5 rounds of Telesis self-review (its own review agent reviewing
its own CI integration code). Legitimate findings decreased across rounds (7→4→3→3→0) while
total findings did not (19→16→11→19→21), exposing a convergence failure tracked in #40.

Key fixes from self-review: input validation for GitHub event payloads, `redirect: 'error'`
on all fetch calls to prevent Authorization header leaking, `Array.isArray` runtime guards,
PR-scoped artifact names to prevent cross-PR theme contamination, orchestration logic moved
from CLI to adapter layer.

---

## v0.8.1 — Review Convergence Fix

**Goal:** Fix review output quality so findings converge toward zero across rounds on the
same diff. Address the noise problem exposed during v0.8.0 self-review (#40).

**Status:** Complete

**Reference:** TDD-006 (Review Convergence), Issue #40

### What Changes

Five complementary noise reduction layers are added to the review pipeline:

1. **Confidence scoring + prompt hardening.** Each finding carries a model-assessed
   confidence score (0-100). Severity-specific thresholds filter low-confidence findings
   (critical: 50, high: 60, medium: 70, low: 80 — lower severity requires higher
   confidence). Anti-pattern guidance tells the model what NOT to report (hedging,
   self-dismissing, speculative edge cases, style preferences). Medium severity tightened
   to require specific rule references.

2. **Enriched theme suppression.** Bare 5-10 word theme strings are replaced with structured
   conclusions that carry the specific decision and an explicit anti-pattern. Instead of
   "redirect prevention in fetch calls", the prompt now says exactly what was concluded and
   what not to suggest — making theme matching precise across review rounds.

3. **Prior findings injection.** Concrete findings from previous review rounds are loaded
   and injected into reviewer prompts as specific "do not re-report" context. Unlike themes
   (abstract patterns), prior findings include exact locations, severities, and descriptions.

4. **Full-file verification pass.** After dedup, a second LLM call reads the full source
   files (not just the diff) and independently verifies each finding. False positives are
   filtered. Verified findings get updated confidence from the verifier's independent
   assessment.

5. **Deterministic noise filter.** A regex-based post-filter catches patterns the model
   emits despite prompt guidance: hedging ("This is correct, but..."), self-dismissal
   ("no action needed"), vague speculation, and low/style findings. Near-zero cost.

### Acceptance Criteria

1. Review findings include a confidence score (0-100)
2. Findings below their severity's confidence threshold are filtered
3. Anti-pattern guidance appears in all review prompts (single-pass and persona)
4. Theme extraction returns structured conclusions alongside bare theme strings
5. Structured conclusions render as explicit suppression rules in persona prompts
6. Prior findings from recent sessions are injected into reviewer prompts
7. Verification pass reads full file contents and filters false positives
8. Deterministic noise filter removes hedging, self-dismissing, and speculative findings
9. Filtered counts are logged to stderr for visibility
10. All new and existing tests pass
11. Running `telesis drift` produces zero errors

### Design Notes

This is an incremental convergence fix, not a faithful reproduction of Bop's full solution.
Bop uses a verification pass (each finding re-evaluated against the diff) which is effective
but doubles model cost per review. That approach remains available as a future enhancement
if the three-layer strategy proves insufficient. The goal is to discover the minimum
intervention needed for convergence, not to replicate every mechanism.

---

## v0.9.0 — Milestone Validation

**Goal:** Automated validation of milestone acceptance criteria, replacing manual
verification with structured checks that confirm a milestone is actually done.

**Status:** Complete

### What Changes

`telesis milestone check` evaluates the current milestone's acceptance criteria against
the actual state of the project — tests passing, drift clean, docs updated, required
commands implemented. This is the gate that prevents "marking done" before it's actually
done.

### Acceptance Criteria

1. `telesis milestone check` evaluates acceptance criteria for the active milestone
2. Criteria that can be verified automatically are checked (tests pass, drift clean, commands exist)
3. Criteria that require human judgment are listed for manual confirmation
4. `telesis milestone complete` marks the milestone done only after checks pass
5. Completing a milestone automatically runs the post-milestone checklist (doc updates, context regen)

---

## v0.10.0 — Review Triage Feedback Loop

**Goal:** Track triage dismissals from any platform (CLI, GitHub, extensible to GitLab/
Gitea/Bitbucket), persist them in `.telesis/`, and inject them as the strongest suppression
signal in review prompts.

**Status:** Complete

**Reference:** TDD-007 (Review Triage Feedback), Issue #45, PR #49

### What Changes

A closed-loop feedback system is added to the review pipeline. When a human dismisses a
finding (via CLI or by replying to a GitHub review comment), that signal is persisted in
`.telesis/dismissals.jsonl` and injected into future review prompts as the strongest
suppression signal — stronger than prior findings or theme conclusions.

Four new CLI commands extend `telesis review`:
- `telesis review dismiss <id> --reason <category>` dismisses a finding
- `telesis review dismissals` lists all dismissals
- `telesis review sync-dismissals --pr <N>` imports dismissals from GitHub PR threads
- `telesis review dismissal-stats` shows aggregated statistics and candidate noise patterns

### Acceptance Criteria

1. `telesis review dismiss <id> --reason <category>` creates a dismissal record
2. `telesis review dismissals` lists all dismissals with metadata
3. `telesis review dismissals --json` outputs dismissals as JSON
4. Dismissed findings are injected into review prompts (stronger than prior findings)
5. Dismissed findings section appears after prior findings section in prompts
6. Dismissed findings are capped at 50 entries in prompts
7. Finding ID markers are embedded in GitHub review comments for correlation
8. `telesis review sync-dismissals --pr <N>` imports dismissals from GitHub PR threads
9. `telesis review dismissal-stats` shows aggregated dismissal statistics
10. `DismissalSource` interface enables future platform adapters
11. All new business logic has colocated unit tests
12. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Types, store, CLI dismiss:** Dismissal types, JSONL store, dismiss + dismissals commands
2. **Phase 2 — Prompt injection:** `formatDismissedFindings()`, thread through prompt builders and agent layer
3. **Phase 3 — GitHub signal import:** Finding markers, review comment listing, GitHub adapter, sync-dismissals
4. **Phase 4 — Pattern aggregation:** Stats computation, dismissal-stats command
5. **Phase 5 — TDD and documentation:** TDD-007, milestone/PRD/architecture updates

---

## v0.10.1 — Review Quality & Local-First Correction

**Goal:** Make the review pipeline converge to zero re-raises of dismissed findings, and
correct the dismiss command's architecture to follow local-first principles.

**Status:** Complete

**Reference:** Issues #50–#53

### What Changes

Post-review fuzzy matching filters findings that match previously dismissed items —
deterministic matching by ID, position, and description similarity, followed by an LLM
judge for semantic re-raises that slip through. When all findings are filtered, a clean
"No New Findings" message replaces the findings report (locally and on GitHub).

The dismiss command is decoupled from GitHub: all state writes to `.telesis/dismissals.jsonl`
first, and a new `sync-replies` command pushes dismissal replies to GitHub PR threads on
demand.

Additional improvements: noise pattern auto-suppression from dismissal statistics,
`--show` annotates findings with dismissal status, and review cost tracking in PR comments
and local output.

### Acceptance Criteria

1. Finding matching a dismissed finding by exact ID is filtered
2. Finding matching by path + category + line overlap (±5 lines) is filtered
3. Finding matching by path + category + description similarity (Jaccard ≥ 0.5) is filtered
4. LLM judge filters semantic re-raises that pass deterministic matching
5. When all findings filtered, local output shows "No new findings. X filtered..."
6. When all findings filtered with `--github-pr`, APPROVE review with "No New Findings" summary
7. Candidate noise patterns (3+ occurrences) auto-suppress matching findings
8. `telesis review dismiss` does NOT call GitHub API (local-only write)
9. `telesis review sync-replies --pr <N>` posts unsynced dismissal replies to GitHub
10. `telesis review --show <id>` annotates dismissed findings with `[DISMISSED: reason]`
11. GitHub PR review summary includes estimated cost
12. Local review summary includes estimated cost
13. All existing tests pass
14. `telesis drift` zero errors

---

## v0.11.0 — Journal & CI Cleanup

**Goal:** Introduce `telesis journal` as a managed design artifact and remove the CI review
workflow now that development is shifting to a local-first, big-commit model.

**Status:** Complete

### What Changes

The design journal becomes a first-class Telesis artifact stored in `.telesis/journal.jsonl`
(JSONL, consistent with notes and dismissals). CLI commands support adding entries, listing
them, showing individual entries, and surfacing recent entries in `telesis context`. The
GitHub Actions CI review workflow is removed — review moves to aggressive local self-review
before commits.

### Acceptance Criteria

1. `telesis journal add <title> <body>` creates a dated journal entry in `.telesis/journal.jsonl`
2. `telesis journal list` lists journal entries by date and title (reverse chronological)
3. `telesis journal list --json` outputs entries as JSON
4. `telesis journal show <query>` displays an entry by ID, date, or title substring
5. `telesis context` includes a "Recent Journal Entries" section with the 3 most recent
   entry titles (not full content — these are large)
6. `.github/workflows/telesis-ci.yml` is removed
7. `telesis drift` no longer checks for CI-related artifacts
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Journal parser:** Parse existing JOURNAL.md format, extract entries by date
2. **Phase 2 — Journal CLI:** `add`, `list`, `show` commands
3. **Phase 3 — Context integration:** Surface recent entries in CLAUDE.md
4. **Phase 4 — CI removal:** Remove workflow file, update drift checks
5. **Phase 5 — Validation:** Verify all criteria, run drift

---

## v0.12.0 — Daemon Foundation

**Goal:** Transform Telesis from a stateless CLI into a long-running daemon with an RxJS
event backbone, filesystem watching, and OS-level lifecycle management. The daemon becomes
the substrate on which all future agent orchestration runs.

**Status:** Complete

**Reference:** TDD-008 (Daemon Foundation)

### What Changes

A daemon process is introduced with `telesis daemon start|stop|status|install` commands.
The daemon watches the project filesystem for changes and emits typed events through an
RxJS event backbone. A local Unix socket provides the control interface. OS supervision
is handled via LaunchAgent (macOS) or systemd (Linux). A minimal TUI client connects to
the daemon for real-time event monitoring.

### Acceptance Criteria

1. `telesis daemon start` starts a background daemon process
2. `telesis daemon stop` gracefully shuts down the daemon
3. `telesis daemon status` reports whether the daemon is running and basic health info
4. `telesis daemon install` configures OS-level supervision (LaunchAgent or systemd)
5. The daemon watches the project directory for file changes and emits typed events
6. Events follow a discriminated union format: `{ type, timestamp, source, payload }`
7. The event backbone uses RxJS Observables with backpressure support
8. A local Unix socket serves as the control interface (start, stop, subscribe)
9. A minimal TUI client connects to the daemon and displays real-time events
10. The daemon survives terminal close when installed via OS supervision
11. PID file management prevents duplicate daemon instances
12. All new business logic has colocated unit tests
13. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Event types and backbone:** Discriminated union event types, RxJS bus
2. **Phase 2 — Filesystem watcher:** chokidar-based watcher emitting events to the bus
3. **Phase 3 — Daemon lifecycle:** start/stop/status, PID file, Unix socket
4. **Phase 4 — OS supervision:** LaunchAgent plist generation, systemd unit generation
5. **Phase 5 — TUI client:** Minimal terminal UI connecting over the socket
6. **Phase 6 — Validation:** End-to-end daemon lifecycle testing

---

## v0.13.0 — ACP Dispatcher

**Goal:** Enable Telesis to spawn and manage coding agents (Claude, Codex, Gemini) via the
Agent Client Protocol (ACP), turning it from a passive observer into an active work executor.

**Status:** Complete

**Reference:** TDD-009 (ACP Dispatcher)

### What Changes

A dispatch subsystem is introduced under `src/dispatch/` that spawns coding agents via
`acpx` (a headless ACP CLI client), manages their sessions, supplies them with project
context from `.telesis/` and `docs/`, and streams their events back through the daemon's
event backbone. The dispatcher handles agent lifecycle, session persistence via separate
meta JSON and event JSONL files, and bounded concurrency.

Dispatch runs in the CLI process. If the daemon is running, the CLI publishes dispatch
events to it for TUI streaming and future specialist agent observation.

### Acceptance Criteria

1. `telesis dispatch run <task>` spawns a coding agent with the given task description
2. `telesis dispatch run --agent <name>` selects a specific agent (claude, codex, gemini)
3. The dispatcher supplies the agent with project context (spec, architecture, conventions)
4. Agent sessions are persisted in `.telesis/sessions/` (meta.json + events.jsonl per session)
5. Agent events stream through the daemon event backbone in real time
6. The TUI displays live agent activity (events, tool calls, output)
7. Bounded concurrency limits the number of simultaneous agents (configurable, default 3)
8. Agent crashes are detected and reported, not silently swallowed
9. `telesis dispatch list` shows active and completed agent sessions
10. `telesis dispatch show <session-id>` replays a session's event log (supports ID prefix)
11. All new business logic has colocated unit tests
12. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Types and adapter:** AgentEvent, SessionMeta types, AgentAdapter interface, acpx subprocess implementation
2. **Phase 2 — Session store:** JSONL persistence for session meta and events
3. **Phase 3 — Context assembly:** Package project context for agent consumption
4. **Phase 4 — Dispatch orchestrator:** Core orchestration: context + adapter + store + events
5. **Phase 5 — Event types and daemon integration:** Extend daemon event union, TUI rendering
6. **Phase 6 — CLI commands:** dispatch run, list, show subcommands
7. **Phase 7 — Drift checks and validation:** acpx containment check, doc updates, version bump

---

## v0.14.0 — Active Oversight & Chronicler

**Goal:** Specialist agents observe the coding agent event stream in real time, providing
continuous oversight rather than post-hoc review. The chronicler captures development
insights automatically from session transcripts.

**Status:** Complete

**Reference:** TDD-010 (Active Oversight & Chronicler)

### What Changes

The agent roster gains active oversight capabilities. The Reviewer, Architect, and a new
Chronicler agent observe the event stream from dispatched coding agents and intervene
when they detect drift, spec violations, or notable decisions.

The Chronicler replaces manual `telesis note` for routine insight capture — it watches
coding sessions, extracts observations about patterns, decisions, and gotchas, and persists
them as structured notes. The human remains in the loop for architectural decisions and
milestone gates.

### Acceptance Criteria

1. The Reviewer agent monitors coding agent output for issues in real time
2. The Architect agent detects drift from spec during coding agent sessions
3. The Chronicler automatically extracts development insights from completed sessions
4. Chronicler-generated notes are distinguishable from human-authored notes
5. Oversight agents operate on the event stream (not polling)
6. Oversight findings surface in the TUI as they occur
7. Agents use versioned policy files (`.telesis/agents/<name>.md`) for configuration
8. Autonomy configuration controls when agents intervene vs. observe silently
9. All new business logic has colocated unit tests
10. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Types and policy parsing:** Observer types, policy file format (.telesis/agents/*.md)
2. **Phase 2 — Event types and TUI rendering:** oversight:* daemon events, TUI formatting
3. **Phase 3 — Observer core:** Generic observer factory with buffering, periodic analysis, drain
4. **Phase 4 — Prompts:** System prompts for reviewer, architect, chronicler
5. **Phase 5 — Reviewer observer:** Code quality monitoring via ModelClient
6. **Phase 6 — Architect observer:** Spec drift detection via ModelClient
7. **Phase 7 — Chronicler:** Post-session note extraction, writes to notes store
8. **Phase 8 — Orchestrator + CLI integration:** Wire observers to dispatch, --no-oversight flag
9. **Phase 9 — Drift, config, docs:** OversightConfig, version bump, doc updates

---

## v0.14.1 — Review Convergence

**Goal:** Improve the multi-round review experience by detecting cross-round finding
recurrence, tracking convergence, and preventing resolved themes from polluting
subsequent rounds.

**Status:** Complete

### What Changes

The review subsystem gains convergence awareness. When the same git ref is reviewed
multiple times, findings are labeled as "new", "persistent", or "resolved" by matching
against prior sessions using Jaccard similarity, positional proximity, and exact ID match.
A convergence summary is displayed after each round showing progress.

Theme extraction is improved to deduplicate sessions by ref — only the most recent
session for a given ref contributes findings to theme analysis, preventing resolved
findings from generating stale themes.

Similarity utilities (`wordBag`, `jaccardSimilarity`) are extracted from the dismissal
matcher into a shared module, enabling reuse for both dismissal matching and cross-round
comparison.

### Acceptance Criteria

1. Findings are labeled as new, persistent, or resolved across review rounds
2. A convergence summary is displayed showing round number and label counts
3. Theme extraction deduplicates sessions by ref (only latest per ref)
4. Similarity utilities are shared between dismissal matcher and convergence detector
5. All new business logic has colocated unit tests
6. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Similarity extraction:** Shared `similarity.ts` module
2. **Phase 2 — Cross-round matcher:** `convergence.ts` with `labelFindings`, `summarizeConvergence`
3. **Phase 3 — CLI integration:** Wire convergence into review display
4. **Phase 4 — Theme dedup:** Filter resolved sessions in `loadRecentFindings`
5. **Phase 5 — Docs and version bump**

---

## v0.14.2 — Dispatch Compatibility

**Goal:** Fix compatibility with acpx 0.3.0 and improve robustness of the oversight
analysis pipeline for real-world sessions.

**Status:** Complete

### What Changes

The acpx adapter is updated to match the acpx 0.3.0 CLI argument layout: top-level flags
(`--cwd`, `--format`, `--approve-all`) go before the agent subcommand, and `prompt`/`cancel`
use `--session` instead of `--name`. The adapter now translates JSON-RPC `session/update`
messages from acpx into `AgentEvent` objects, supporting text output, tool calls, tool
results, and thinking events.

The JSON response parser (`parseJsonResponse`) gains bracket-matching extraction for
finding JSON arrays or objects embedded in model prose — handling models that wrap
structured output in natural language.

Agent session creation failures (e.g., Claude ACP's upstream "Internal error") now produce
actionable error messages suggesting alternative agents.

### Acceptance Criteria

1. `telesis dispatch run --agent codex` streams events from acpx 0.3.0 successfully
2. JSON-RPC session/update messages are translated to AgentEvent objects
3. Oversight reviewer can parse findings from model responses with surrounding prose
4. Agent session creation failures include actionable suggestions
5. All new business logic has colocated unit tests
6. Running `telesis drift` produces zero errors

---

## v0.15.0 — Work Intake (GitHub Issues)

**Goal:** Bridge GitHub Issues to the dispatch pipeline. Issues are imported, normalized
into a common format, presented for human approval, and dispatched to coding agents
automatically — closing the gap between "work exists" and "work is being done."

**Status:** Complete

**Reference:** TDD-011 (Work Intake)

### What Changes

An `IntakeSource` adapter interface establishes the pattern for pluggable work sources.
The GitHub adapter imports open issues from the configured repo, normalizes them into
`WorkItem` records persisted in `.telesis/intake/`, and presents them for human approval.
Approved items are dispatched to coding agents via the existing dispatch pipeline.

The intake config lives in `.telesis/config.yml` under an `intake` key, supporting
label filtering, assignee filtering, and exclude labels.

Linear, Jira, and other sources can be added in future milestones by implementing the
same `IntakeSource` interface.

### Acceptance Criteria

1. `telesis intake github` imports open issues from the configured GitHub repo
2. Work items are normalized into a common internal format with status tracking
3. Duplicate imports are detected and skipped (dedup by source + sourceId)
4. `telesis intake list` displays pending work items for human review
5. `telesis intake approve <id>` dispatches the item to a coding agent
6. `telesis intake skip <id>` marks an item as skipped
7. Work item status is tracked end-to-end (intake → dispatch → completion)
8. Configurable filters control which issues are eligible for intake
9. Intake events flow through the daemon event backbone
10. All new business logic has colocated unit tests
11. Running `telesis drift` produces zero errors

**Future work (not in scope):** Linear adapter, Jira adapter, daemon-driven automatic
approval, interactive TUI, webhook-driven sync.

### Build Sequence

1. **Phase 1 — Types and IntakeSource interface:** WorkItem, RawIssue, IntakeSource
2. **Phase 2 — Work item store:** Per-item JSON persistence in `.telesis/intake/`
3. **Phase 3 — Config parsing:** `parseIntakeConfig()` for intake section
4. **Phase 4 — GitHub source adapter:** Issue fetching, PR filtering, normalization
5. **Phase 5 — Sync orchestrator:** Fetch → dedup → normalize → store
6. **Phase 6 — Approval and dispatch bridge:** Approve → dispatch → track completion
7. **Phase 7 — Event types and TUI:** Intake daemon events, TUI formatting
8. **Phase 8 — CLI commands and formatting:** `telesis intake` subcommands
9. **Phase 9 — Drift, docs, version bump:** Validation and documentation

---

## v0.16.0 — Planner Agent

**Goal:** Decompose work items into sequenced, dispatchable tasks. A planning agent
analyzes a work item and produces a task dependency graph that the dispatch pipeline
can execute in order.

**Status:** Complete

**Reference:** TDD-012 (Planner Agent)

### What Changes

A planner agent decomposes work items into ordered task lists with dependency relationships.
Plans are created as `draft`, approved by humans, then executed sequentially via the existing
dispatch pipeline. Each task gets its own dispatch session. Plan state is persisted after
every task, enabling crash recovery.

The `--plan` flag on `telesis intake approve` creates a plan instead of dispatching directly.
Plan configuration lives in `.telesis/config.yml` under a `planner` key.

### Acceptance Criteria

1. `telesis plan create <work-item-id>` decomposes a work item into tasks via LLM
2. Tasks have dependency relationships validated by topological sort (Kahn's algorithm)
3. `telesis plan list` and `telesis plan show <id>` display plan state
4. `telesis plan approve <id>` transitions a plan from draft to approved
5. `telesis plan execute <id>` dispatches tasks sequentially in dependency order
6. `telesis intake approve <id> --plan` creates a plan instead of dispatching directly
7. Plans are stored as structured JSON in `.telesis/plans/`
8. Plan events (`plan:*`) flow through the daemon event backbone
9. Crash recovery: re-executing a failed plan skips completed tasks
10. Configurable planner model and max tasks via `.telesis/config.yml`
11. All new business logic has colocated unit tests
12. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Types, store, validation:** Plan/PlanTask types, atomic JSON store, topological sort
2. **Phase 2 — Planner agent:** LLM-based decomposition with project context and prompt injection defense
3. **Phase 3 — CLI commands and formatting:** `telesis plan` subcommands, list/detail formatters
4. **Phase 4 — Executor and intake integration:** Sequential task dispatch, `--plan` flag
5. **Phase 5 — Events, config, drift, docs:** Plan events, planner config, drift checks, documentation

---

## v0.17.0 — Validation & Correction

**Goal:** Verify dispatch output against acceptance criteria and automatically retry
on failure with bounded retries and human escalation.

**Status:** Complete

**Reference:** TDD-013 (Validation & Correction)

### Acceptance Criteria

1. A validation agent verifies dispatch output against acceptance criteria
2. Failed validation triggers automatic correction (retry with feedback)
3. The correction loop has bounded retries (configurable, default 3)
4. Exhausted retries escalate to human review
5. Milestone gates pause autonomous operation for human review
6. All new business logic has colocated unit tests
7. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Types, Config, Events:** Extended statuses, validation types, config parser, event types
2. **Phase 2 — Diff Capture:** Git ref capture, ref-to-HEAD diff, session event summarization
3. **Phase 3 — Validation Agent:** LLM-based prompts and validator
4. **Phase 4 — Correction Prompt:** Feedback-driven correction prompt builder
5. **Phase 5 — Executor Integration:** Validate-correct loop in plan executor
6. **Phase 6 — Milestone Gates:** awaiting_gate status with human approval
7. **Phase 7 — CLI Commands:** --no-validate, retry, skip-task, gate-approve
8. **Phase 8 — Drift, docs, version bump**

---

## v0.18.0 — Full Loop & Self-Hosting

**Goal:** Add a `telesis run` command that orchestrates the complete pipeline — from work
item to committed code — with human gates at plan approval and milestone completion.

**Status:** Complete

**Reference:** TDD-014 (Full Loop Pipeline)

### Acceptance Criteria

1. `telesis run <work-item-id>` orchestrates the full pipeline (plan → execute → commit → push)
2. Interactive plan approval gate (skippable with `--auto-approve`)
3. Git operations module: branch, commit, push with typed results
4. GitHub PR creation and issue close/comment operations
5. Configurable git behavior (commitToMain, branchPrefix, pushAfterCommit, createPR)
6. Configurable pipeline behavior (autoApprove, closeIssue)
7. New daemon events for pipeline and git lifecycle
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Git Operations Module:** `src/git/` — branch, commit, push, commit message generation
2. **Phase 2 — GitHub PR & Issue Operations:** Extract `src/github/http.ts`, add `src/github/pr.ts`
3. **Phase 3 — Config Additions:** `GitConfig` and `PipelineConfig` parsers
4. **Phase 4 — Pipeline Orchestrator:** `src/pipeline/` — full loop sequencing
5. **Phase 5 — CLI Command:** `telesis run` command with flags
6. **Phase 6 — Events, Drift, TUI:** New event types, formatting, drift directories
7. **Phase 7 — Self-Hosting Validation:** Run on Telesis itself (deferred to post-release)
8. **Phase 8 — Documentation & Version Bump**

---

## v0.19.0 — Pipeline Hardening & Review Intelligence

**Goal:** Harden the full loop pipeline with quality gates, LLM-generated commit messages,
pipeline resumability, and commit squashing. Improve review convergence with plateau
detection, new/recurring labels, and active theme filtering. Add dispatch session
narrative reconstruction.

**Status:** Complete

### What Changes

The pipeline gains several reliability and intelligence improvements: configurable quality
gates that run format/lint/test/build/drift/review checks before push, LLM-generated commit
messages and PR body descriptions, pipeline state persistence for crash recovery and
resumability, and squashing of agent commits into a single pipeline commit.

The review convergence system becomes smarter: plateau detection recommends stopping when
80%+ of findings are recurring across 3+ rounds, each finding is labeled `[new]` or
`[recurring]` in output, and stale themes that no longer match current findings are filtered
from display.

Dispatch gains `--text` mode for reconstructing readable agent narratives from session events.

### Acceptance Criteria

1. Quality gates run configurable checks (format, lint, test, build, drift, review) before push
2. Quality gates amend the commit when formatters modify files
3. LLM-generated commit messages from diff + plan context
4. LLM-generated PR body descriptions
5. Pipeline state persisted to `.telesis/pipeline-state/` for resumability
6. Agent commits squashed into a single pipeline commit
7. Plateau detection when round >= 3 and recurring ratio >= 80%
8. Findings labeled `[new]` or `[recurring]` in review output (round 2+)
9. Stale themes filtered from display based on current findings
10. `telesis dispatch show <id> --text` reconstructs readable agent narrative
11. All new business logic has colocated unit tests
12. Running `telesis drift` produces zero errors

---

## v0.20.0 — Polyglot Support

**Goal:** Remove TypeScript-specific assumptions so Telesis can manage projects in any language.
The config schema, drift checks, file scanning, and milestone validation all become language-aware.

**Status:** Complete

### What Changes

The config schema replaces `language` (singular string) with `languages` (array), enabling
multi-language projects. Drift checks gain a `languages` metadata field — 8 TypeScript-specific
checks are skipped for non-TS projects while 6 language-agnostic checks run unconditionally.
File scanning generalizes from `findTypeScriptFiles` to `findSourceFiles` with a configurable
extension map covering 12 languages. Milestone validation reads quality gate commands from
config instead of hardcoding `pnpm`.

### Acceptance Criteria

1. Config with `languages: ["Go", "Python"]` loads correctly; `language` computed as first entry
2. `save()` writes `languages` array
3. Config extraction prompt requests and parses `languages` array from LLM
4. Drift checks have `languages?: string[]` metadata (`undefined` = all languages)
5. `runChecks` filters checks by project languages when provided
6. `findSourceFiles` accepts configurable extensions; `findTypeScriptFiles` is a thin wrapper
7. `extensionsForLanguages` maps language names to file extensions (12 languages)
8. `ScanContext` accepts optional extensions parameter
9. Milestone checks use quality gates from config instead of hardcoded `pnpm` commands
10. Without quality gates configured, milestone check skips with info message
11. `telesis drift` on a TypeScript project runs all 14 checks
12. `telesis drift` on a non-TS project skips TS-specific checks
13. All new business logic has colocated unit tests
14. Running `telesis drift` produces zero errors

---

## v0.21.0 — MCP Server

**Goal:** Expose all Telesis capabilities as MCP tools so Claude Code (or any MCP client)
can act as the orchestrator. The business logic is already CLI-framework-agnostic; the MCP
server is a new adapter layer, not a rewrite.

**Status:** Complete

### What Changes

A separate `telesis-mcp` binary exposes 22 MCP tools and 6 MCP resources over stdio. Every
business logic function gets its own tool with a Zod schema. Project documents (VISION.md,
MILESTONES.md, etc.) are exposed as readable MCP resources. The review pipeline (~360 lines)
is extracted from `src/cli/review.ts` into `src/agent/review/pipeline.ts` so both CLI and
MCP share the same orchestration. Input validation (slug regex, length caps, path traversal
prevention) hardens the MCP adapter layer against untrusted input.

### Acceptance Criteria

1. `pnpm run build` compiles both `telesis` and `telesis-mcp` binaries
2. `telesis-mcp` starts a stdio MCP server with all tools registered
3. MCP client can list 22 tools via `listTools()`
4. MCP client can list 6 resources via `listResources()`
5. `telesis_status` returns project metadata as structured JSON
6. `telesis_drift` returns drift report with pass/fail per check
7. `telesis_context_generate` atomically regenerates CLAUDE.md
8. `telesis_review` runs the full multi-persona review pipeline and returns structured results
9. `runReview()` in `src/agent/review/pipeline.ts` is called by both CLI and MCP
10. CLI `telesis review` behavior unchanged after pipeline extraction
11. All Zod schemas enforce input constraints (slug patterns, length caps)
12. `telesis_milestone_complete` does NOT perform git operations (returns next steps)
13. `ModelClient` constructed at server level, injected into tools via factory
14. All new business logic has colocated unit tests
15. Running `telesis drift` produces zero errors

---

## v0.22.0 — Orchestrator Walking Skeleton

**Goal:** Turn Telesis from a toolbox into a feedback and control system. The orchestrator is
a deterministic state machine inside the daemon that enforces the full development lifecycle
— from work item intake through shipped milestone — with targeted LLM calls for judgment and
7 human decision points. Coding agents receive tasks; the orchestrator handles everything else.

**Status:** Complete

### What Changes

The daemon gains an orchestrator module — a persistent state machine that drives the complete
lifecycle: intake → triage → milestone setup → planning → execution → quality gates → review
convergence → milestone check → milestone completion. State is persisted to
`.telesis/orchestrator.json` for crash recovery. The orchestrator makes targeted LLM calls
(Haiku-class) for judgment at triage (suggest grouping) and milestone setup (does this need a
TDD?). Human decisions are queued and surfaced via OS notifications; CLI commands
(`telesis orchestrator status`, `approve`, `reject`) provide the interaction interface. Claude
Code hooks gate git operations on preflight checks. Serial work item execution only — no
parallelism in this milestone.

### Acceptance Criteria

1. Orchestrator state machine implemented with all 10 states (INTAKE through DONE)
2. Orchestrator runs inside the daemon process, subscribes to event bus
3. State transitions enforce preconditions (cannot skip states)
4. Orchestrator state persisted to `.telesis/orchestrator.json`, resumes after crash
5. LLM judgment call at TRIAGE suggests work item grouping into milestone scope
6. LLM judgment call at MILESTONE_SETUP determines whether a TDD is needed
7. Human decisions queued in `.telesis/decisions/`, surfaced via OS notifications (macOS)
8. `telesis orchestrator status` shows current state, pending decisions, active milestone
9. `telesis orchestrator approve <id>` and `reject <id> --reason "..."` respond to decisions
10. REVIEWING state runs review-fix-review loop until convergence (new + persistent ≤ 3)
11. MILESTONE_COMPLETE state runs full completion workflow (version bump, doc updates, context regen)
12. Claude Code hooks installed: `PreToolCall(git commit)` runs `telesis preflight`
13. Orchestrator emits events on the daemon bus for all state transitions
14. Walking skeleton tested end-to-end: work item → shipped milestone on the Telesis repo
15. All new business logic has colocated unit tests
16. Running `telesis drift` produces zero errors

---

## v0.23.0 — Orchestrator Activation

**Goal:** Connect the orchestrator walking skeleton to real business logic and install
enforcement hooks. The state machine drives actual intake, planning, dispatch, review, and
milestone completion. Claude Code hooks gate git operations on preflight checks.

**Status:** Complete

### What Changes

A factory function (`buildRunnerDeps`) wires every RunnerDeps function to the real business
logic modules — intake sync, work item loading, plan creation, task execution, quality gates,
review convergence, milestone check/complete. A `telesis orchestrator run` command drives the
state machine forward in a loop until it reaches a decision point or returns to idle. Claude
Code hooks are installed to gate `git commit` on `telesis preflight` checks.

### Acceptance Criteria

1. `buildRunnerDeps(rootDir, bus, modelClient)` factory constructs real deps from existing modules
2. `telesis orchestrator run` advances the state machine until waiting or idle
3. Intake dep calls `syncFromSource` / `listWorkItems` from `src/intake/`
4. Planning dep calls `createPlanFromWorkItem` from `src/plan/create.ts`
5. Execution dep calls `executePlan` from `src/plan/executor.ts`
6. Quality gates dep calls `runQualityGates` from `src/pipeline/quality-gates.ts`
7. Review convergence dep wires `runConvergenceLoop` to `runReview` and dispatch
8. Milestone deps call `checkMilestone` and `completeMilestone` from `src/milestones/`
9. Claude Code hook config: `PreToolCall(git commit)` runs `telesis preflight`
10. End-to-end: orchestrator advances through at least intake → triage on the Telesis repo
11. All new business logic has colocated unit tests
12. Running `telesis drift` produces zero errors

---

## v0.24.0 — Telemetry Streaming

**Goal:** Migrate the telemetry reader from batch loading to streaming for large JSONL files.
Currently `loadTelemetryRecords` reads the entire `.telesis/telemetry.jsonl` into memory,
which becomes a bottleneck as the file grows over months of usage.

**Status:** Complete

### What Changes

The telemetry reader (`src/agent/telemetry/reader.ts`) gains a streaming mode that processes
records line-by-line instead of loading the entire file. Callers that need aggregates (token
counts, cost) use a streaming reducer. The `telesis status` command and cost derivation adapt
to use the streaming API.

### Acceptance Criteria

1. Streaming reader processes telemetry.jsonl line-by-line without loading entire file
2. `getStatus()` produces the same results using streaming reader
3. Cost derivation works with streaming reader
4. Existing batch `loadTelemetryRecords` retained for backward compatibility
5. Performance improvement measurable on files with >10k records
6. All new business logic has colocated unit tests
7. Running `telesis drift` produces zero errors

---

## v0.25.0 — Orchestrator Triage UX

**Goal:** Make the orchestrator's triage and milestone setup flow usable without manual JSON
editing. The human can see LLM grouping suggestions, select work items, and provide milestone
metadata — all through the CLI.

**Status:** Complete

### What Changes

The `telesis orchestrator approve` command gains structured input for triage decisions:
`--items` to select work items, `--milestone-name`, `--milestone-id`, `--goal` to set
milestone metadata. The triage grouping LLM suggestion is included in the decision detail
and displayed in status output. Decision details are formatted for human readability in
`telesis orchestrator status`.

### Acceptance Criteria

1. `advanceTriage` stores LLM grouping suggestion in the decision detail
2. `telesis orchestrator status` formats decision details readably (not raw JSON)
3. `telesis orchestrator approve <id> --items wi-1,wi-2` selects work item subset
4. `telesis orchestrator approve <id> --milestone-name "..." --milestone-id "0.25.0" --goal "..."` sets milestone metadata
5. Approved triage metadata carries into orchestrator context (milestoneId/name/goal)
6. Approving without `--items` includes all items (backward compatible)
7. User guide updated with new approve flags and triage workflow
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

---

## v0.26.0 — MCP Orchestrator Integration

**Goal:** Expose orchestrator capabilities as MCP tools and push decision notifications into
Claude Code's context via logging messages. Claude Code becomes a first-class orchestrator
client — it can drive the lifecycle, approve decisions, and receive state updates without
shelling out to the CLI.

**Status:** Complete

### What Changes

Five new MCP tools expose the orchestrator: status, run, approve, reject, preflight. The MCP
server gains a logging message push channel — when the orchestrator creates a decision, it
pushes a notification into connected Claude Code sessions with the decision summary and
approve command. Resources signal updates when CLAUDE.md is regenerated.

### Acceptance Criteria

1. `telesis_orchestrator_status` MCP tool returns current state and pending decisions
2. `telesis_orchestrator_run` MCP tool advances the state machine
3. `telesis_orchestrator_approve` MCP tool approves with optional triage metadata
4. `telesis_orchestrator_reject` MCP tool rejects with reason
5. `telesis_orchestrator_preflight` MCP tool returns preflight check results
6. When a decision is created, `sendLoggingMessage` pushes notification to connected clients
7. User guide MCP page updated with new tools
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

---

## v0.27.0 — Distribution & Auto-Update

**Goal:** Make Telesis installable by anyone with a single command, publish platform binaries
to GitHub Releases, and provide a self-update mechanism.

**Status:** Complete

### What Changes

A `telesis release` command cross-compiles for 4 targets (darwin-arm64, darwin-x64, linux-x64,
linux-arm64), creates a GitHub Release, and uploads the binaries. An `install.sh` script
detects the platform and downloads the right binary. A `telesis update` command checks for
new releases and replaces the running binary. The daemon checks for updates daily on its first
heartbeat after midnight and notifies via OS notification if an update is available.

### Acceptance Criteria

1. `telesis release` builds both binaries for all 4 platform targets
2. `telesis release` creates a GitHub Release with all assets attached
3. `install.sh` detects OS and architecture, downloads correct binary, installs to PATH
4. `telesis update` checks GitHub Releases API for latest version
5. `telesis update` downloads and replaces both binaries when update is available
6. `telesis update` reports "already up to date" when current
7. Daemon checks for updates on first heartbeat after midnight, notifies if available
8. User guide updated with installation and update documentation
9. All new business logic has colocated unit tests
10. Running `telesis drift` produces zero errors

---

## v0.28.0 — Multi-Session Orchestrator

**Goal:** Make the orchestrator survive agent session boundaries. When a coding agent session
ends mid-milestone — whether from context exhaustion, a hook block, a crash, or clean
completion — the orchestrator captures enough state for a new session to resume intelligently
without manual reconstruction.

**Status:** Complete

**Reference:** TDD-018 (Multi-Session Orchestrator)

### What Changes

The orchestrator gains three capabilities: mid-execution checkpointing (task progress persisted
after each completed task), session tracking (which session is active, when it started, why the
last session ended), and a resume briefing (structured orientation artifact for new sessions that
includes orchestrator state, workspace status, and recommended next action).

The `OrchestratorContext` gains session fields: `sessionId`, `sessionStartedAt`,
`sessionEndedAt`, `sessionExitReason`. The plan executor checkpoints `currentTaskIndex` after
each task completion. A new `resume-briefing` MCP tool (and CLI command) inspects orchestrator
context, git working tree state, and last session exit reason to produce an actionable
orientation for the incoming session.

### Acceptance Criteria

1. Plan executor persists `currentTaskIndex` to orchestrator context after each task completes
2. Resuming execution after a session death starts from the last checkpointed task, not task 1
3. `OrchestratorContext` tracks `sessionId`, `sessionStartedAt`, `sessionEndedAt`,
   `sessionExitReason` (hook_block | context_full | error | clean | unknown)
4. Session fields are set when `executing` begins and updated when the session ends
5. `telesis orchestrator resume-briefing` CLI command produces a structured orientation:
   current state, completed tasks, workspace status (uncommitted changes, staged files),
   last session exit reason, and recommended next action
6. `telesis_orchestrator_resume_briefing` MCP tool exposes the same orientation to LLM clients
7. Resume briefing detects uncommitted changes consistent with completed work (task done but
   commit blocked) and recommends the appropriate recovery path
8. Resume briefing is idempotent — safe to call multiple times without side effects
9. All new business logic has colocated unit tests
10. Running `telesis drift` produces zero errors

---

## v0.29.0 — Daemon Session Lifecycle

**Goal:** The daemon becomes the session lifecycle manager. When a dispatched agent session
completes or fails, the daemon automatically persists exit state, generates a resume briefing,
and — based on configurable policy — re-dispatches the next orchestrator step or notifies the
human. The orchestrator no longer depends on an external actor to notice that a session ended
and manually advance the state machine.

**Status:** Complete

**Reference:** TDD-019 (Daemon Session Lifecycle)

### What Changes

The daemon subscribes to `dispatch:session:completed` and `dispatch:session:failed` events
on the event bus. On session end, it persists the exit reason to orchestrator context (using
v0.28.0 session tracking fields), generates a resume briefing, and applies the configured
restart policy. The dispatcher and `AgentAdapter` (acpx) already handle session creation,
monitoring, and cleanup — v0.29.0 wires the daemon to react to their output and drive the
orchestrator forward.

Session history is already tracked in `.telesis/dispatch/` via `SessionMeta`. The orchestrator
status command is extended to surface dispatch session history for the current milestone.

### Acceptance Criteria

1. Daemon subscribes to `dispatch:session:completed` and `dispatch:session:failed` bus events
2. On session end, daemon persists exit reason to orchestrator context via session tracking
3. Daemon generates resume briefing artifact on session end (writes to `.telesis/`)
4. Daemon re-dispatches the next orchestrator step when restart policy is `auto-restart`
5. Daemon sends OS notification when restart policy is `notify-only` (default)
6. Configurable restart policy in `.telesis/config.yml`: auto-restart, notify-only, manual
7. Auto-restart respects a configurable cooldown (default 30s) to prevent thrashing
8. Auto-restart respects a max-restart count per milestone (default 10) as circuit breaker
9. `telesis orchestrator status` shows dispatch session history for the current milestone
10. Exit reason mapping: dispatch `completed` → orchestrator `clean`, dispatch `failed` →
    orchestrator `error`, acpx error containing "hook" or "preflight" → `hook_block`
11. All new business logic has colocated unit tests
12. Running `telesis drift` produces zero errors

---

## v0.30.0 — Provider-Neutral Enforcement

**Goal:** Telesis enforcement works without Claude Code-specific integration. The daemon
provides preflight gating and contextual guidance through provider-neutral mechanisms — git
hooks and MCP resources — so that Codex, Gemini, or any MCP-compatible agent receives the
same guardrails as Claude Code.

**Status:** Complete

**Reference:** TDD-020 (Provider-Neutral Enforcement)

### What Changes

`telesis hooks install` installs native git hooks (pre-commit) that call `telesis orchestrator
preflight`, replacing the dependency on Claude Code's PreToolUse hooks for enforcement.
Contextual guidance currently delivered via `.claude/skills/` is also served as MCP resources
that any MCP-compatible client can read. The git hooks and Claude Code hooks coexist — the git
hook defers if it detects the Claude Code hook already ran preflight in the current process.

### Acceptance Criteria

1. `telesis hooks install` installs a git pre-commit hook that calls `telesis orchestrator
   preflight`
2. `telesis hooks uninstall` removes the installed git hook
3. Git hook exits non-zero when preflight fails, blocking the commit
4. Git hook defers (exits 0) if Claude Code hook already ran preflight for this commit
5. Contextual guidance (currently skills) is served as MCP resources with descriptions
   matching the skill frontmatter
6. Any MCP-compatible client can read guidance resources and receive the same context as
   Claude Code skills provide
7. MCP server emits process nudges via logging messages when orchestrator state changes
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

---

## v0.31.0 — Unified Init

**Goal:** Evolve `telesis init` into a single command that handles all onboarding scenarios:
greenfield projects, existing projects with pre-created docs, and version migration from
older telesis installations. Remove the `upgrade` command — `init` handles everything.

**Status:** Complete

**Reference:** TDD-021 (Unified Init)

### What Changes

`telesis init` auto-detects the project state and applies the appropriate mode:
- **Greenfield** (no `.telesis/`, no docs): full AI interview + doc generation (existing behavior)
- **Existing project** (no `.telesis/`, has docs): ingest existing docs, create `.telesis/config.yml`,
  scaffold missing artifacts (skills, hooks, MCP config), identify doc gaps
- **Migration** (has `.telesis/` from older version): retrofit missing scaffold artifacts
  (current `upgrade` behavior absorbed into init)

All modes end with provider detection and appropriate adapter installation (Claude Code:
skills + hooks; generic: git hooks + MCP resources). The `upgrade` command is removed.

### Acceptance Criteria

1. `telesis init` on a greenfield project runs the AI interview (existing behavior preserved)
2. `telesis init` on a project with existing docs (PRD.md, ARCHITECTURE.md, etc.) ingests
   them and creates `.telesis/config.yml` without requiring the full interview
3. `telesis init` on a project with `.telesis/` from an older version retrofits missing
   scaffold artifacts (skills, hooks, MCP config)
4. `telesis init` identifies missing docs and reports gaps (e.g., "VISION.md not found")
5. `telesis init` detects LLM provider and installs appropriate adapter
6. `telesis init` is idempotent — safe to run repeatedly on the same project
7. `telesis upgrade` command is removed
8. `telesis init --docs <path>` accepts a custom docs directory
9. All new business logic has colocated unit tests
10. Running `telesis drift` produces zero errors

---

## v0.32.0 — Enterprise Integration

**Goal:** Enable Telesis to work with GitHub Enterprise (self-hosted) and Jira for issue
intake. These are the minimum integrations needed to use Telesis on a real work project
outside the personal/open-source context it was built in.

**Status:** Complete

**Reference:** TDD-022 (GitHub Enterprise), TDD-023 (Jira Intake)

### What Changes

**GitHub Enterprise support:**
- Parameterize the GitHub API base URL (currently hardcoded to `api.github.com`)
- Generalize remote URL parsing for GHE domains
- Client factory pattern to close over configurable `apiBase`
- Config: `github.apiUrl` + env override `GITHUB_API_URL`

**Jira intake adapter:**
- New `src/jira/` package with REST API client
- Jira `IntakeSource` adapter implementing the existing interface
- Auth: Jira Cloud (email + API token) and Jira Server (PAT), auto-detected
- Config: `intake.jira` with `baseUrl`, `project`, `jql`, `labels`, `assignee`, `status`, `issueTypes`
- CLI: `telesis intake jira`
- MCP: `telesis_intake_jira` tool

### Acceptance Criteria

1. `GITHUB_API_URL` or `github.apiUrl` config overrides the API base for all GitHub operations
2. Git remote parsing works for GHE domains (SSH and HTTPS)
3. Existing github.com behavior unchanged when no override is set
4. `telesis intake jira` imports issues from a configured Jira instance
5. Jira auth auto-detects Cloud (Basic) vs Server (Bearer) from env vars
6. JQL is constructed from config fields or accepted as a custom override
7. Jira work items flow through the existing sync/approve/dispatch pipeline unchanged
8. `telesis_intake_jira` MCP tool works
9. All new business logic has colocated unit tests
10. Running `telesis drift` produces zero errors

---

## v0.33.0 — Monorepo Support

**Goal:** Decouple git root from project root so `telesis init` and hook installation work
in monorepo subdirectories where `.git/` is at the repo root and `.telesis/` is per-service.

**Status:** Complete

**Reference:** TDD-024 (Monorepo Support)

### What Changes

- New `findGitRoot()` utility — walks upward for `.git/` independently from `.telesis/`
- `installHook` accepts separate `projectRoot` and `gitRoot` parameters
- Hook body uses absolute paths so preflight runs from the correct project root
- All callers updated (init, hooks install CLI)

### Acceptance Criteria

1. `telesis init` succeeds when `.git/` is an ancestor of `cwd` (not co-located)
2. Git pre-commit hook is installed at the correct `.git/hooks/` path
3. Hook body `cd`s to the project root before running `telesis orchestrator preflight`
4. Multiple telesis projects in one repo install independent hook sections
5. Existing single-repo behavior is unchanged (git root = project root)
6. `telesis hooks install` and `telesis hooks uninstall` work with separate roots
7. All new business logic has colocated unit tests
8. Running `telesis drift` produces zero errors

---

## v0.34.0 — Declarative Drift Containment

**Goal:** Let projects declare import containment rules in config rather than requiring
Telesis source code changes. Unblocks enforcing architecture boundaries in any project.

**Status:** Complete

**Reference:** TDD-025 (Declarative Drift Containment)

### Acceptance Criteria

1. `drift.containment` config section is parsed and validated
2. Each containment rule generates a `DriftCheck` that runs alongside built-in checks
3. Rules support: import pattern, allowedIn paths, severity, excludeTests
4. Config-generated checks appear in `telesis drift` output with `containment:` prefix
5. `--check containment:<name>` filter works
6. Go import syntax is matched (bare string imports inside import blocks)
7. Test files are excluded by default (`excludeTests: true`)
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

---

## v0.35.0 — TUI Foundation

**Goal:** Build an interactive terminal UI for monitoring Telesis state and events.
Zero-dependency framework built on raw ANSI escape codes. Foundation for the full
interactive workflow (intake/dispatch/review/pipeline) in v0.36.0.

**Status:** Complete

**Reference:** TDD-026 (TUI Foundation)

### Acceptance Criteria

1. `telesis tui` opens an interactive full-screen terminal UI
2. Dashboard view shows project status, milestone, orchestrator state, recent events
3. Events view shows scrollable, filterable event log with existing color scheme
4. Tab / number keys switch between views
5. Arrow keys scroll in events view; auto-scroll on new events
6. Event type filtering (all, daemon, fs, dispatch, etc.)
7. `q` / Ctrl+C cleanly exits (restores terminal state)
8. Requires running daemon; shows actionable error if daemon is not running
9. All new business logic has colocated unit tests
10. Running `telesis drift` produces zero errors

---

## v0.36.0 — TUI Workflow

**Goal:** Add interactive workflow views to the TUI: intake management, pipeline monitoring,
dispatch sessions, and review findings. The TUI becomes the primary interaction surface for
driving the full Telesis lifecycle.

**Status:** Complete

**Reference:** TDD-027 (TUI Workflow Views)

### Acceptance Criteria

1. Intake view lists work items with keyboard selection and approve/skip/plan actions
2. Pipeline view shows active pipeline state and quality gate results
3. Dispatch view lists sessions with status indicators
4. Review view lists review sessions with finding counts
5. Number keys 3-6 switch to workflow views
6. All views refresh data from disk on demand
7. All new business logic has colocated unit tests
8. Running `telesis drift` produces zero errors

---

## v0.37.0 — Existing Project Onboarding

**Goal:** Make `telesis init` and `telesis context` work well on existing projects,
especially monorepos with documentation in non-standard locations. The interview reads
existing docs instead of re-asking what's already written. Init works without a TTY.
Context generation supports layered doc paths and inlines TDD substance.

**Status:** Complete

**Reference:** TDD-029 (Existing Project Onboarding)

### Acceptance Criteria

1. `discoverDocs()` recursively finds ARCHITECTURE.md, PRD.md, ADR dirs, TDD dirs, and
   other known doc patterns anywhere in the project tree
2. The interview system prompt includes discovered doc content — the interviewer references
   existing docs and only asks about gaps
3. `telesis init --non-interactive` skips readline, infers config from discovered docs +
   manifests, generates only missing docs, and exits cleanly
4. `detectState()` uses discovery as fallback — projects with docs outside `docs/` root
   are correctly identified as "existing" mode
5. `context.layers` config allows specifying additional doc source directories with scoped
   doc types (ADRs, TDDs, context files, etc.)
6. `telesis context generate` merges docs from all configured layers into CLAUDE.md
7. TDD Overview and Interfaces sections are inlined in CLAUDE.md (Draft and Accepted TDDs,
   up to 10 most recent)
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Doc discovery:** `src/scaffold/doc-discovery.ts` — recursive scanner with
   depth/size limits, tests
2. **Phase 2 — Doc-aware interview:** inject discovered docs into interview system prompt,
   update prompt instructions for gap-filling mode
3. **Phase 3 — Non-interactive init:** `--non-interactive` flag, skip readline, config
   inference from discovered docs, generate missing docs only
4. **Phase 4 — Layered doc paths:** config schema extension, context generation merges
   across layers
5. **Phase 5 — TDD inlining:** `scanTDDs()` function, template section, capped at 10

---

## v1.0.0 — Production Ready

**Goal:** Stabilize Telesis through cross-project usage. Address gaps in generalization,
edge cases, and ergonomics discovered by running on real projects beyond the Telesis repo.

**Status:** Planned

### Acceptance Criteria

1. Telesis has been used on at least 2 projects beyond itself
2. All generalization gaps discovered during cross-project usage are resolved
3. Configuration, defaults, and error messages are production-quality
4. Comprehensive documentation covers setup, usage, and extension
5. All business logic has colocated unit tests
6. Running `telesis drift` produces zero errors