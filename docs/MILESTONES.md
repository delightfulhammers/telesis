# Telesis — Milestones
*By Delightful Hammers*
*Last updated: 2026-03-12*

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

## v0.15.0 — Work Intake

**Goal:** Enable Telesis to ingest work from external sources (issue trackers, human
commands via TUI) and route it through the dispatch pipeline, closing the gap between
"work exists" and "work is being done."

**Status:** Planned

### What Changes

Work intake adapters connect Telesis to external sources of work: GitHub Issues, Linear,
Jira, and direct human commands via the TUI. Incoming work items are normalized into a
common format, prioritized, and routed to the dispatcher. The human approves work
assignment at configurable gates.

### Acceptance Criteria

1. `telesis intake github` imports open issues from the configured GitHub repo
2. `telesis intake linear` imports issues from a configured Linear project
3. Work items are normalized into a common internal format
4. The TUI displays pending work items for human review and approval
5. Approved work items are dispatched to coding agents automatically
6. Work item status is tracked end-to-end (intake → dispatch → completion)
7. Configurable filters control which issues are eligible for intake
8. All new business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Work item types:** Common format for normalized work items
2. **Phase 2 — GitHub adapter:** Import issues via `gh` CLI / GitHub API
3. **Phase 3 — Linear adapter:** Import issues via Linear API
4. **Phase 4 — Intake CLI and TUI:** Display, filter, approve work items
5. **Phase 5 — Dispatch integration:** Route approved items to the dispatcher

---

## v1.0.0 — Full Loop

**Goal:** Complete the intake → understand → plan → dispatch → monitor → validate →
correct → complete cycle. Telesis operates as a fully autonomous development companion
within human-defined boundaries.

**Status:** Planned

### What Changes

All pieces connect: work arrives via intake, context is assembled, a plan is formed, coding
agents are dispatched, oversight agents monitor execution, validation confirms correctness,
and the loop self-corrects on failure. The human sets boundaries (milestones, autonomy
level, approval gates) and Telesis operates within them.

### Acceptance Criteria

1. End-to-end: an issue can flow from intake to merged code with human approval at gates
2. The planning agent decomposes work items into dispatchable tasks
3. Failed validation triggers automatic correction (retry with feedback)
4. The correction loop has bounded retries with human escalation
5. Milestone gates pause autonomous operation for human review
6. The full loop operates on the Telesis repo itself (self-hosting)
7. Comprehensive documentation covers the full orchestration model
8. All business logic has colocated unit tests
9. Running `telesis drift` produces zero errors

### Build Sequence

1. **Phase 1 — Planner agent:** Decompose work items into tasks
2. **Phase 2 — Validation agent:** Verify dispatch output against acceptance criteria
3. **Phase 3 — Correction loop:** Retry with feedback on validation failure
4. **Phase 4 — End-to-end wiring:** Connect intake → plan → dispatch → monitor → validate → correct
5. **Phase 5 — Self-hosting validation:** Run the full loop on Telesis itself
6. **Phase 6 — Documentation and stabilization**