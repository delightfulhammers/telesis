# TDD-007 — Review Triage Feedback Loop

**Status:** Accepted
**Date:** 2026-03-11
**Author:** Delightful Hammers
**Related:** v0.10.0 milestone, Issue #45, TDD-006 (Review Convergence)

---

## Overview

The five-layer convergence fix (v0.8.1, TDD-006) reduced noise significantly but cannot
eliminate it entirely because the pipeline has no feedback from human triage decisions.
When a reviewer dismisses a finding as false-positive or not-actionable, that signal is
lost — the same patterns recur in subsequent rounds.

Evidence from PRs #43, #46, and #48 shows: contradictory advice across rounds, factually
incorrect re-raised findings, and findings on unchanged code that were not acted on but
keep returning. The missing piece is a closed-loop: **signal source → store → consumer**.

### What this TDD addresses

A three-layer architecture for dismissal feedback:

1. **Signal capture:** CLI dismiss command and platform adapter interface for importing
   dismissals from GitHub (and future platforms)
2. **Persistent store:** Cross-session dismissal store (`.telesis/dismissals.jsonl`)
3. **Prompt injection:** Dismissed findings rendered as the strongest suppression signal
   in review prompts, capped at 50 entries (higher than the 30-cap for prior findings)

### What this TDD does not address (scope boundary)

- **GitLab/Gitea/Bitbucket adapters.** The `DismissalSource` interface is defined;
  implementations are deferred until platform-specific need arises.
- **Automatic noise-filter rule generation.** Candidate patterns are surfaced for
  inspection but not automatically fed into the noise filter.
- **Dismissal-based confidence adjustment.** Findings similar to dismissed patterns
  could have their confidence reduced; this is a future enhancement.
- **Emoji reaction signals from GitHub.** Reactions on comments could serve as
  lightweight dismiss/acknowledge signals. Deferred.
- **Interactive TUI for bulk triage.** Deferred to a later milestone.

### Prior art from Bop

Bop v0.8.x implements cross-round theme suppression using semantic dedup (LLM-based
string comparison). Telesis takes a different approach: deterministic string matching on
structured dismissal records. This is cheaper (no LLM call) and auditable (the human
explicitly dismissed the finding). The Bop approach is still available via theme
extraction for patterns that emerge organically from review rounds.

---

## Architecture

### Three-layer design

```
  [Signal Sources]       [Persistent Store]        [Consumer]
  ┌──────────────┐       ┌──────────────────┐      ┌──────────────────────┐
  │ CLI dismiss   │──────▶│ .telesis/         │─────▶│ formatDismissedFind- │
  │ GitHub sync   │       │ dismissals.jsonl  │      │ ings() in prompts.ts │
  │ (future: GL,  │       │                   │      │                      │
  │  Gitea, BB)   │       │ Append-only JSONL │      │ Injected after prior │
  └──────────────┘       └──────────────────┘      │ findings, capped at  │
                                                    │ 50 entries            │
                                                    └──────────────────────┘
```

### Data flow

1. **CLI dismiss:** User identifies finding ID → `telesis review dismiss <id> --reason fp`
   → finding metadata copied from session store → appended to `dismissals.jsonl`
2. **GitHub sync:** `telesis review sync-dismissals --pr <N>` → fetches review comments →
   filters for `<!-- telesis:finding:UUID -->` markers → infers reason from reply text →
   appends to `dismissals.jsonl`
3. **Prompt injection:** `loadRecentDismissals()` (90-day window) → `formatDismissedFindings()`
   → appended to system prompt after prior findings section

### Dismissal record

```typescript
interface Dismissal {
  id: string;              // UUID
  findingId: string;       // references ReviewFinding.id
  sessionId: string;       // references ReviewSession.id
  reason: DismissalReason; // false-positive | not-actionable | already-addressed | style-preference
  timestamp: string;       // ISO 8601
  source: DismissalSource; // cli | github | gitlab | gitea | bitbucket
  path: string;            // copied from finding
  severity: Severity;      // copied from finding
  category: Category;      // copied from finding
  description: string;     // copied from finding
  suggestion: string;      // copied from finding
  persona?: string;        // copied from finding
  note?: string;           // optional free-text
}
```

Dismissals copy finding metadata so they remain useful even if the original session is
deleted. This is a deliberate denormalization — trading storage for resilience.

### GitHub correlation

Finding ID markers are embedded as hidden HTML comments in GitHub review comment bodies:
`<!-- telesis:finding:UUID -->`. This enables reliable correlation when importing resolved
threads. Reply text is pattern-matched for reason inference: `[fp]` → false-positive,
`[na]` → not-actionable, `[style]` → style-preference, default → already-addressed.

### Pattern aggregation

`computeDismissalStats()` groups dismissals by reason, category, severity, and persona.
`findCandidateNoisePatterns()` uses n-gram extraction (3-6 word phrases) to find
description substrings recurring across 3+ dismissals with the same reason. These are
surfaced via `telesis review dismissal-stats` for inspection — not automatically applied.

---

## Integration points

| Module | Change |
|--------|--------|
| `src/agent/review/dismissal/types.ts` | New — Dismissal, DismissalReason, DismissalSource types |
| `src/agent/review/dismissal/store.ts` | New — append/load/query for dismissals.jsonl |
| `src/agent/review/dismissal/source.ts` | New — DismissalSignal, DismissalSource interface |
| `src/agent/review/dismissal/stats.ts` | New — aggregation and pattern detection |
| `src/agent/review/dismissal/format.ts` | New — terminal formatting for dismissal list and stats |
| `src/agent/review/prompts.ts` | `formatDismissedFindings()`, extended `buildSinglePassPrompt` + `buildPersonaSystemPrompt` |
| `src/agent/review/agent.ts` | `dismissedFindings` parameter on `reviewDiff` + `reviewWithPersonas` |
| `src/cli/review.ts` | dismiss, dismissals, sync-dismissals, dismissal-stats subcommands |
| `src/github/format.ts` | Finding ID markers (`<!-- telesis:finding:UUID -->`) |
| `src/github/client.ts` | `listPullRequestReviewComments()` |
| `src/github/dismissals.ts` | New — GitHub DismissalSource adapter |

---

## Testing strategy

- **Unit tests:** Types validation, store round-trip, append-only accumulation, malformed line handling, age filtering, finding lookup
- **Prompt tests:** `formatDismissedFindings` format, 50-cap enforcement, empty → no section, ordering (after prior findings)
- **GitHub tests:** Marker embedding in comments, marker extraction regex, reason inference from reply text, thread grouping, signal extraction
- **Stats tests:** Aggregation by dimension, noise pattern detection, empty inputs produce zero counts
- **Integration:** The pipeline is tested end-to-end via the existing review test infrastructure (recorded fixtures)

No live model calls needed — all new functionality is deterministic or uses the existing model client interface.
