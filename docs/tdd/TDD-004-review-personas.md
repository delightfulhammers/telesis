# TDD-004 — Review Personas

**Status:** Draft
**Date:** 2026-03-10
**Author:** Delightful Hammers
**Related:** v0.6.0 milestone, TDD-003 (review agent), Bop (prior art)

---

## Overview

The v0.5.0 review agent performs a single comprehensive pass. v0.6.0 introduces
persona-based multi-perspective review: specialized reviewers (security expert,
architecture guardian, etc.) each focus on a narrow concern, producing higher-signal
findings than a generalist pass. Findings are deduplicated within a session and enriched
with cross-round context from prior sessions.

### What it does

1. Defines a set of review personas — specialized reviewer perspectives with distinct
   system prompts and category focus
2. An orchestrator selects which personas to engage based on the diff content and project
   context (notes, conventions, file types)
3. Selected personas review the diff in parallel, each producing focused findings
4. Findings are deduplicated across personas within a session via an LLM merge call
5. Cross-round theme extraction prevents re-reporting issues from prior sessions
6. Results are displayed grouped by persona with dedup metadata

### What it does not do (scope boundary)

- Does not support multiple LLM providers (Anthropic only for v0.6.0, but the data model
  accommodates future providers via an optional `model` field per persona)
- Does not implement automatic persona creation or discovery
- Does not implement weighted scoring or consensus merge (Bop feature; may come later)
- Does not implement finding verification (a separate concern from review)

### Lessons from Bop

Bop proved that multi-perspective review is structurally better than single-perspective.
Key lessons informing this design:

- **Focused attention beats breadth.** A security reviewer that ignores style produces
  fewer false positives and deeper findings than a generalist reviewer.
- **String-based dedup is insufficient.** Two personas describing the same issue use
  different vocabulary. Fingerprinting and keyword overlap are unreliable. LLM-based
  semantic dedup is necessary.
- **Input-side suppression beats output-side filtering.** Injecting prior themes into
  the prompt prevents duplicate generation entirely, which is cheaper and more effective
  than filtering duplicates from the output.
- **Cross-round context is the highest-signal dedup mechanism.** Theme extraction from
  prior sessions prevents the same issues from surfacing review after review.

---

## Architecture

### Persona Definition

A persona is a structured definition, not a free-form prompt:

```typescript
interface PersonaDefinition {
  readonly slug: string;           // "security", "architecture", "correctness"
  readonly name: string;           // "Security Reviewer"
  readonly preamble: string;       // expertise description for the system prompt
  readonly focusCategories: readonly Category[];
  readonly ignoreCategories: readonly Category[];
}
```

**Built-in personas** are defined as typed constants in `src/agent/review/personas.ts`.
The initial set ships with three:

1. **security** — injection, secrets, auth, unsafe input handling, trust boundaries
2. **architecture** — import discipline, package boundaries, convention violations,
   documented design decisions, SOLID principles
3. **correctness** — bugs, logic errors, null risks, error handling, performance,
   edge cases

The system supports N personas. Three is the opinionated default; users can add, remove,
or override personas via `.telesis/config.yml`. The orchestrator decides which to engage
per review — the full set is the *available* personas, not the *mandatory* set.

### Persona-Specific Prompts

`buildPersonaSystemPrompt(persona, context)` wraps the existing prompt structure:

1. Persona preamble (expertise description)
2. Project review criteria (from `assembleReviewContext`, unchanged)
3. Focused attention directive: "Focus primarily on: [focusCategories]. You may ignore:
   [ignoreCategories]."
4. Response format (unchanged from v0.5.0)
5. Cross-round themes section (if themes were extracted): "Previously identified themes —
   do not re-report unless the issue appears in new code."

The existing `buildSystemPrompt` becomes `buildSinglePassPrompt` — the generalist prompt
used by `--single` mode.

### Orchestrator: Persona Selection

The orchestrator inspects the diff and project context to decide which personas to engage.
This is a lightweight heuristic, not an LLM call:

- **File type signals:** e.g., if the diff only touches `.md` files, skip security and
  correctness; run architecture only. If the diff touches `*.test.ts` only, skip security.
- **Diff size signals:** for very small diffs (< 50 lines), run fewer personas to avoid
  cost disproportionate to the change.
- **Always-on personas:** architecture runs on every non-trivial diff because convention
  violations don't correlate with file type.
- **Override via `--personas`:** explicit persona selection bypasses the orchestrator.

The orchestrator returns the selected persona set with rationale (logged for debugging).

### Parallel Execution

Selected persona calls are fired via `Promise.all`. Each gets its own system prompt but
the same diff and file list. Token cost scales with the number of personas; wall-clock
latency is bounded by the slowest persona.

### Within-Session Deduplication

After all persona calls complete:

1. **Group candidates:** findings targeting the same file path with overlapping line ranges
   (or both lacking line numbers) are dedup candidates.
2. **LLM dedup call:** a single lightweight call receives candidate groups (just descriptions
   and suggestions, not the full diff) and returns which findings are semantically equivalent.
3. **Merge strategy:** keep the highest severity, combine suggestions, tag with
   `dedupGroupId` linking the merged findings.
4. **Fallback:** if the dedup call fails or returns garbage, all findings pass through
   unmerged. Warning on stderr, not a crash.

Skippable with `--no-dedup` for cost-sensitive usage.

### Cross-Round Theme Extraction

When prior sessions exist:

1. Read the N most recent sessions (default: 3) from `.telesis/reviews/`.
2. Extract themes via a single lightweight LLM call. Themes are short summaries:
   "line number validation on model output", "path traversal via session ID".
3. Inject themes into each persona's system prompt as suppression context.
4. Store extracted themes in session metadata for provenance.

First review on a repo has no prior sessions — no theme call, clean degradation.

Skippable with `--no-themes`.

### Model Flexibility

Each persona definition has an optional `model` field. If omitted, the project's configured
model is used (from `.telesis/config.yml` or the default `claude-sonnet-4-6`). This means:

- Today: all personas use the same Anthropic model.
- Future: a persona could specify `model: "gpt-5.4"` when multi-provider support is added.
- The orchestrator, dedup, and theme extraction calls each specify their own model
  independently.

The `ModelClient` interface does not change — it already accepts a `model` field per
request. Provider routing is a future concern outside this TDD's scope.

---

## Type Changes

### ReviewFinding

```typescript
interface ReviewFinding {
  readonly id: string;
  readonly sessionId: string;
  readonly severity: Severity;
  readonly category: Category;
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly description: string;
  readonly suggestion: string;
  readonly persona?: string;        // slug of the persona that produced this
  readonly dedupGroupId?: string;   // links findings merged during dedup
}
```

### ReviewSession

```typescript
interface ReviewSession {
  readonly id: string;
  readonly timestamp: string;
  readonly ref: string;
  readonly files: readonly ChangedFile[];
  readonly findingCount: number;
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: TokenUsage;
  readonly mode: "single" | "personas";
  readonly personas?: readonly string[];    // slugs of personas that ran
  readonly themes?: readonly string[];      // cross-round themes injected
}
```

### New Types

```typescript
interface PersonaDefinition {
  readonly slug: string;
  readonly name: string;
  readonly preamble: string;
  readonly focusCategories: readonly Category[];
  readonly ignoreCategories: readonly Category[];
  readonly model?: string;
}

interface PersonaResult {
  readonly persona: string;
  readonly findings: readonly ReviewFinding[];
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
}

interface DedupResult {
  readonly findings: readonly ReviewFinding[];
  readonly mergedCount: number;
  readonly tokenUsage?: TokenUsage;
}
```

---

## CLI Interface

```
telesis review                           # persona-based review (default)
telesis review --single                  # single-pass generalist review
telesis review --personas sec,arch       # run only named personas
telesis review --no-dedup                # skip within-session deduplication
telesis review --no-themes               # skip cross-round theme extraction
```

Existing flags (`--all`, `--ref`, `--json`, `--min-severity`, `--list`, `--show`) are
unchanged.

---

## Session Storage

The JSONL format is structurally identical. New fields (`persona`, `dedupGroupId`, `mode`,
`personas`, `themes`) appear in the records. Pre-1.0 — no migration needed.

---

## Display Format (Persona Mode)

```
Review: staged changes
Personas: security, architecture, correctness
══════════════════════════════════════════════════

  Security
  ────────
  ✗ [critical] security — src/agent/review/diff.ts:45
    Shell injection via unsanitized ref parameter
    Suggestion: Validate ref against safe character allowlist

  Architecture
  ────────────
  · [medium] architecture — src/cli/review.ts:120
    ModelClient created inside CLI command instead of injected
    Suggestion: Accept ModelClient as parameter for testability

──────────────────────────────────────────────────
3 findings (1 critical, 1 medium, 1 low) · 4.2k tokens · 3.1s
  [2 duplicates merged across personas]
```

In `--single` mode, findings are displayed flat (same as v0.5.0).

---

## Build Sequence

### Phase 1 — Types and Persona Definitions

- Extend `types.ts` with new fields and interfaces
- Create `personas.ts` with built-in persona definitions
- Tests for persona structure, slug uniqueness

### Phase 2 — Persona-Specific Prompts

- Rename `buildSystemPrompt` → `buildSinglePassPrompt`
- Add `buildPersonaSystemPrompt(persona, context, themes?)`
- Add `buildDedupPrompt` and `buildThemeExtractionPrompt`
- Tests for prompt generation

### Phase 3 — Persona Orchestrator and Parallel Execution

- Create orchestrator: persona selection heuristics based on diff/context
- Parallel execution via `Promise.all`, one `reviewDiff` call per persona
- Tag findings with persona slug
- Aggregate token usage and duration
- Tests with mock model client

### Phase 4 — Within-Session Deduplication

- Create `dedup.ts`: candidate grouping, LLM dedup call, merge strategy
- Fallback on dedup failure (no crash, all findings pass through)
- Tests with fixture scenarios

### Phase 5 — Cross-Round Theme Extraction

- Create `themes.ts`: read prior sessions, extract themes via LLM, format for injection
- Clean degradation on first review (no prior sessions)
- Tests with fixture sessions

### Phase 6 — CLI Integration and Formatter

- Add `--single`, `--personas`, `--no-dedup`, `--no-themes` flags
- Wire orchestrator as default path; `--single` calls `reviewDiff` directly
- Persona-grouped display in formatter
- Aggregate token usage across all calls
- Tests for CLI flag handling and display formatting

### Phase 7 — Config Integration and Validation

- Add optional `review.personas` to config schema
- Config personas merge with/override built-in defaults (match by slug)
- Run `telesis drift` — zero errors
- Full test suite pass

---

## Decisions

1. **Orchestrator selects personas per review.** The orchestrator inspects the diff and
   project context to decide which personas to engage. This avoids wasting model calls
   on irrelevant perspectives (e.g., security review of a docs-only change). The heuristic
   is deterministic and fast — no LLM call for selection.

2. **Three built-in personas, extensible to N.** Security, architecture, and correctness
   are the opinionated defaults. The system supports arbitrary personas via config. Three
   is not a hardcoded limit — it is a curated starting set.

3. **Model field per persona, defaulting to project model.** Future-proofs for
   multi-provider without building provider routing now. Today all personas use the same
   Anthropic model. Tomorrow a persona could specify a different model.

4. **LLM-based dedup, not fingerprinting.** Bop proved that string-based dedup is
   unreliable across different reviewer vocabularies. A single lightweight LLM call is
   worth the cost for reliable dedup.

5. **Input-side theme suppression.** Prior themes are injected into persona prompts to
   prevent re-generation of known issues. Cheaper and more effective than post-hoc
   filtering.

6. **Persona-based review is the new default.** `--single` preserves the generalist mode
   for quick, cheap reviews. Pre-1.0, no backward compatibility burden.

---

## Resolved Questions

1. **Why not have the orchestrator be an LLM call?** The orchestrator's job is fast
   pattern matching (file extensions, diff size, category relevance). An LLM call would
   add latency and cost for a decision that can be made with simple heuristics. If the
   heuristics prove insufficient, this can be upgraded later.

2. **Why not merge suggestions from deduplicated findings?** When two personas flag the
   same issue, their suggestions may complement each other. The dedup merge keeps the
   higher-severity finding's description and combines both suggestions, giving the user
   the benefit of multiple perspectives on the fix.

3. **Why 3 default personas and not more?** Each persona multiplies input tokens. Three
   personas triple the input cost per review. Adding a fourth (e.g., observability) would
   quadruple it. The default set should cover the highest-signal perspectives. Users who
   want more can add personas via config.
