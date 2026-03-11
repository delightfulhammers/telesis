# TDD-003 — Review Agent

**Status:** Accepted
**Date:** 2026-03-10
**Author:** Delightful Hammers
**Related:** v0.5.0 milestone, TDD-001 (init agent patterns), Bop (prior art)

---

## Overview

The review agent is Telesis's first quality-gate capability — a native agent that reviews
code changes against the project's own spec documents and produces structured findings. It
replaces the need for an external review tool (like Bop) by leveraging what Telesis already
knows: the project's architecture, requirements, conventions, and decisions.

### What it does

1. Accepts a diff (staged changes, branch diff, or commit range)
2. Assembles review criteria dynamically from project documents (ARCHITECTURE.md, PRD.md,
   conventions, ADRs)
3. Sends the diff + criteria to the model in a single focused review call
4. Produces structured findings with severity, category, file location, and suggestion
5. Stores the full review session in `.telesis/reviews/`
6. Prints a formatted report to the terminal

### What it does not do (scope boundary)

- Does not use multiple personas or lenses (single comprehensive pass for v0.5.0)
- Does not deduplicate findings across review rounds (future: iterative review)
- Does not post findings to GitHub PRs or external services
- Does not auto-fix findings
- Does not run in CI (output format supports it, but the integration is out of scope)
- Does not orchestrate other agents or coordinate with coding assistants

### Prior art: Bop

Bop proved several ideas that inform this design:

- **Multi-perspective review produces higher signal** than a single generic pass. v0.5.0
  defers personas but the data model supports them from day one.
- **Severity-based filtering** is essential. Not every observation is worth surfacing.
- **Cross-round deduplication** is the single most important signal-to-noise feature.
  Deferred to a follow-on milestone, but the findings storage model is designed for it.
- **Structured findings** (not prose paragraphs) enable triage, tracking, and automation.
- **Setup tax kills adoption.** Bop's configuration complexity is a cautionary tale. The
  Telesis reviewer works with zero configuration beyond `telesis init`.

---

## Components

### 1. Diff Resolver

Translates the CLI input into a unified diff string. This is the only component that
interacts with git. The rest of the pipeline operates on a diff string.

**Input modes:**

| Mode | CLI | Git command |
|------|-----|-------------|
| Staged changes | `telesis review` (default) | `git diff --cached` |
| Working + staged | `telesis review --all` | `git diff HEAD` |
| Branch diff | `telesis review --ref main` | `git diff main...HEAD` |
| Commit range | `telesis review --ref abc..def` | `git diff abc..def` |

The diff resolver also extracts file-level metadata: which files changed, insertions,
deletions. This metadata feeds into the review prompt and the findings storage.

```typescript
interface ResolvedDiff {
  readonly diff: string;
  readonly files: readonly ChangedFile[];
  readonly ref: string;          // human-readable description of what was diffed
}

interface ChangedFile {
  readonly path: string;
  readonly status: "added" | "modified" | "deleted" | "renamed";
}
```

**Empty diff:** If the resolved diff is empty, the CLI prints a message and exits 0. No
model call is made.

### 2. Review Context Assembler

Builds the review prompt by reading the project's spec documents. This is the zero-config
advantage: the project teaches the reviewer what to care about.

**Documents read:**

| Document | What it provides |
|----------|-----------------|
| ARCHITECTURE.md | Structural claims, package discipline, import rules, error handling conventions |
| PRD.md | Feature requirements, CLI contracts, expected behaviors |
| `docs/context/*.md` | Working conventions, style rules, scope discipline |
| `docs/adr/*.md` | Active architectural decisions and their rationale |
| `docs/tdd/*.md` | Component designs and interface contracts |
| `.telesis/notes.jsonl` | Development notes (gotchas, patterns, known issues) |

The assembler does **not** dump entire documents into the prompt. It extracts the sections
most relevant to code review:

- Package discipline / import rules from ARCHITECTURE.md
- Error handling conventions
- Working conventions from context files
- Active ADR decisions (accepted status only)
- Development notes (rendered as bullet points)

This keeps the prompt focused and within reasonable token budgets. The full documents are
available for deeper review in future persona-based modes.

```typescript
interface ReviewContext {
  readonly conventions: string;       // assembled review criteria
  readonly projectName: string;
  readonly primaryLanguage: string;
}
```

### 3. Review Agent

The core component. Takes a diff and review context, calls the model, and parses the
response into structured findings.

**Prompt design:**

The system prompt instructs the model to:
1. Review the diff against the provided project conventions and architecture
2. Focus on correctness, maintainability, security, and convention adherence
3. Assign each finding a severity (critical, high, medium, low)
4. Assign each finding a category (bug, security, architecture, maintainability,
   performance, style)
5. Include the file path and line range for each finding
6. Provide a concrete suggestion, not just a description of the problem
7. Return findings as a JSON array within a structured response

The user message contains:
1. The assembled review criteria
2. The diff
3. The list of changed files with their status

**Structured output:**

The model returns a JSON array of findings. The agent validates and normalizes the
response. Malformed model output falls back to an error finding that surfaces the raw
response for debugging.

```typescript
interface RawModelFinding {
  readonly severity: string;
  readonly category: string;
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly description: string;
  readonly suggestion: string;
}
```

**Severity filtering:**

The agent filters findings below a configurable severity threshold. Default: show all.
The CLI supports `--min-severity <level>` to filter at display time without affecting
storage.

### 4. Findings Store

Persists review sessions in `.telesis/reviews/` as individual JSONL files, one per session.
Each session file contains a header record followed by finding records.

**Why per-session files** (not a single append-only JSONL like telemetry):
- Review sessions are the natural unit of retrieval (`--show <id>`)
- Listing sessions is a directory scan, not a file parse
- Per-session files stay small and fast to read
- Cleanup/archival operates on whole files

```typescript
interface ReviewSession {
  readonly id: string;              // uuid
  readonly timestamp: string;       // ISO 8601
  readonly ref: string;             // what was reviewed ("staged changes", "main...HEAD")
  readonly files: readonly ChangedFile[];
  readonly findingCount: number;
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: TokenUsage;
}

interface ReviewFinding {
  readonly id: string;              // uuid
  readonly sessionId: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly category: string;
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly description: string;
  readonly suggestion: string;
}
```

**Session file format** (`.telesis/reviews/<session-id>.jsonl`):
```
{"type":"session","data":{...ReviewSession}}
{"type":"finding","data":{...ReviewFinding}}
{"type":"finding","data":{...ReviewFinding}}
```

### 5. Review Formatter

Renders findings to the terminal. Two output modes:

**Default (human-readable):**
```
Review: staged changes
═══════════════════════════════════════════════════

  ✗ [high] bug — src/notes/store.ts:20-35
    appendNote returns success even when write fails

    Suggestion: Let mkdirSync and appendFileSync throw naturally.
    Move error policy to the CLI layer.

  ✗ [medium] architecture — src/cli/note.ts:14
    stdin reader has no size limit

    Suggestion: Add a MAX_STDIN_BYTES constant and reject
    when exceeded.

──────────────────────────────────────────────────
2 findings (1 high, 1 medium) · 1,200 tokens · 2.3s
```

**JSON (`--json`):**
```json
{
  "session": { ... },
  "findings": [ ... ]
}
```

### 6. CLI Entrypoint

```
telesis review                        # review staged changes
telesis review --all                  # review working + staged changes
telesis review --ref <ref>            # review diff vs ref
telesis review --json                 # JSON output
telesis review --min-severity <level> # filter findings by severity
telesis review --list                 # list past review sessions
telesis review --show <id>            # show findings from a past session
```

The `review` command uses `handleAction` for error handling. It requires a project root
(`.telesis/config.yml` must exist). It requires an Anthropic API key (via environment
variable, same as `telesis init`).

---

## Interfaces

### Diff Resolver

```typescript
export const resolveDiff = (
  rootDir: string,
  ref?: string,
  all?: boolean,
): ResolvedDiff;
```

Executes git commands via `execSync`. Throws if the working directory is not a git
repository. Returns `{ diff: "", files: [], ref: "..." }` for empty diffs.

### Review Context Assembler

```typescript
export const assembleReviewContext = (rootDir: string): ReviewContext;
```

Reads project documents synchronously. Missing documents are skipped — the assembler
produces the best context it can from what exists. An empty project (no docs at all) still
produces a minimal context with generic review criteria.

### Review Agent

```typescript
export const reviewDiff = async (
  client: ModelClient,
  diff: string,
  files: readonly ChangedFile[],
  context: ReviewContext,
): Promise<readonly ReviewFinding[]>;
```

Pure function (aside from the model call). Does not read the filesystem or interact with
git. All input is provided by the caller.

### Findings Store

```typescript
export const saveReviewSession = (
  rootDir: string,
  session: ReviewSession,
  findings: readonly ReviewFinding[],
): void;

export const loadReviewSession = (
  rootDir: string,
  sessionId: string,
): { session: ReviewSession; findings: readonly ReviewFinding[] };

export const listReviewSessions = (
  rootDir: string,
): readonly ReviewSession[];
```

### Review Formatter

```typescript
export const formatReviewReport = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
): string;
```

---

## Data Model

### Filesystem layout

```
.telesis/
  reviews/                    ← NEW; review session storage
    <session-id>.jsonl        ← one file per review session
```

### Review session lifecycle

```
CLI input → Diff Resolver → ResolvedDiff
                                ↓
Project docs → Context Assembler → ReviewContext
                                ↓
ResolvedDiff + ReviewContext → Review Agent → ReviewFinding[]
                                ↓
ReviewSession + ReviewFinding[] → Findings Store → .telesis/reviews/<id>.jsonl
                                ↓
ReviewSession + ReviewFinding[] → Formatter → terminal output
```

### Token budget

The review prompt has three variable-size components:

| Component | Typical size | Upper bound |
|-----------|-------------|-------------|
| Review criteria (conventions) | ~2,000 tokens | ~5,000 tokens |
| Diff | varies widely | capped at ~50,000 tokens |
| File list | ~100 tokens | ~500 tokens |

**Large diff handling:** If the diff exceeds the token cap, the agent splits it into
file-level chunks and reviews each chunk separately, producing findings per-chunk. The
session aggregates all findings. This is transparent to the user — the output looks the
same.

The token cap is a soft limit derived from the model's context window minus the system
prompt and expected output size. For claude-sonnet-4-6 (200k context), a conservative
cap of 50,000 diff tokens leaves ample room for context and response.

---

## Package Structure

```
src/agent/review/
  types.ts              ← ReviewSession, ReviewFinding, ChangedFile, etc.
  diff.ts               ← resolveDiff (git interaction)
  diff.test.ts
  context.ts            ← assembleReviewContext (doc reading)
  context.test.ts
  agent.ts              ← reviewDiff (model call + response parsing)
  agent.test.ts
  store.ts              ← saveReviewSession, loadReviewSession, listReviewSessions
  store.test.ts
  format.ts             ← formatReviewReport
  format.test.ts
  prompts.ts            ← review system prompt
  prompts.test.ts
src/cli/
  review.ts             ← Commander subcommands
```

The review agent lives under `src/agent/review/` alongside the existing `interview/` and
`generate/` agents. It follows the same patterns: types in `types.ts`, model interaction
through `ModelClient`, telemetry automatic via the client.

---

## Error Handling

- **No git repo:** Throw with actionable message ("not a git repository")
- **No API key:** Throw with actionable message ("ANTHROPIC_API_KEY not set")
- **Empty diff:** Print message, exit 0. No model call, no session stored.
- **Model call failure:** Retry once (via ModelClient), then throw. The CLI catches and
  prints the error.
- **Malformed model response:** Store a session with zero findings and a warning. Print the
  warning with the raw response excerpt so the user can see what happened. Do not throw —
  a bad model response is not a system error.
- **Review store write failure:** Log to stderr, do not abort. The review still prints to
  the terminal. (Same pattern as telemetry: storage is important but not more important
  than showing the user their results.)
- **Missing project docs:** Assembler gracefully degrades. No docs → generic review
  criteria. Some docs → partial context. This is never an error.

---

## Decisions

1. **Single-pass review for v0.5.0.** Bop proved that personas improve signal, but they
   also multiply cost and latency. The MVP reviewer does one comprehensive pass. Personas
   are a v0.6.0 concern — the data model supports them (findings have categories that map
   to persona lenses) but the agent doesn't use them yet.

2. **Diff as input, not files.** The reviewer operates on diffs, not whole files. This
   bounds the input size, focuses attention on what changed, and matches developer mental
   model ("review my changes"). Whole-file review is a different use case (audit) that
   may come later.

3. **Dynamic criteria from project docs.** Zero-config review is a key differentiator.
   The assembler reads the project's own documents — the same ones the developer already
   wrote via `telesis init`. No separate review configuration file. If the project docs
   say "no process.exit in business logic," the reviewer checks for that.

4. **Per-session storage, not append-only.** Unlike telemetry (one long JSONL file),
   reviews are stored one file per session. Sessions are the natural retrieval unit, and
   per-file storage makes listing, showing, and future cleanup straightforward.

5. **Git interaction contained in diff resolver.** Only `diff.ts` executes git commands.
   The rest of the pipeline is git-agnostic. This makes testing easy (pass a diff string)
   and future-proofs for non-git scenarios (e.g., reviewing arbitrary file content).

6. **Model choice.** Default to claude-sonnet-4-6, same as init agent. Review quality
   matters, but latency and cost also matter for inner-loop use. Sonnet is the right
   balance. Configurable in `.telesis/config.yml`.

---

## Resolved Questions

1. **Prompt caching for review criteria.** Deferred. Premature optimization for v0.5.0.
   The review context is stable across calls but the cost savings don't justify adding
   cache control plumbing to `ModelClient` at this stage.

2. **Diff token estimation.** Use a simple `chars / 4` heuristic for the soft cap. Large-
   diff chunking (splitting into per-file chunks) is not a day-one feature — most review
   diffs fit comfortably within the 50k token budget. If the diff exceeds the cap, the
   agent returns an error suggesting `--ref` to narrow the scope. Chunking can be added
   later without changing the public interface.

3. **Finding deduplication contract.** No fingerprint field in v0.5.0. Bop's experience
   (three-stage dedup: dispute inheritance → SHA-256 fingerprints → semantic LLM dedup,
   plus input-side theme extraction) proved that simple fingerprints alone are insufficient.
   When cross-round dedup is built, it will need semantic dedup from the start. Adding a
   fingerprint field now would create a false sense of progress. The store's per-session
   file format supports future dedup without schema changes — a dedup pass reads prior
   sessions and injects context into the review prompt.

4. **Review of deleted files.** No special handling needed. Git includes deleted files in
   the diff naturally (as removal hunks). The reviewer sees the deletion and can flag
   architectural violations. Bop takes the same approach — deleted files appear in the
   diff with empty patches, no filtering.
