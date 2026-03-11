# TDD-006 — Review Convergence

**Status:** Accepted
**Date:** 2026-03-11
**Author:** Delightful Hammers
**Related:** v0.8.1 milestone, Issue #40, TDD-004 (review personas), TDD-005 (GitHub integration)

---

## Overview

The v0.8.0 self-review of PR #39 exposed a convergence failure: legitimate findings
decreased across rounds (7→4→3→3→0), but total findings did not (19→16→11→19→21).
Round 5 produced 21 findings at 100% noise — repeat themes, hedging, self-dismissal,
hallucinated issues, and over-engineering suggestions. The signal-to-noise ratio degraded
instead of improving.

### Root Causes

1. **Theme injection is too abstract.** Bare 5-10 word strings give the model insufficient
   context to match and suppress specific findings. "redirect prevention in fetch calls"
   is open to interpretation — the model doesn't know what was concluded.
2. **No confidence scoring.** Every finding is treated equally regardless of the model's
   certainty. Speculative nits occupy the same pipeline as confirmed bugs.
3. **No prompt anti-patterns.** The model isn't told what NOT to report, so it fills the
   space with hedged observations that technically aren't wrong but aren't actionable.
4. **Severity guidelines are too permissive.** Medium ("maintainability concern") casts
   too wide — any subjective observation qualifies.
5. **No deterministic noise filter.** Hedging and self-dismissal patterns slip through
   even when the model was instructed to avoid them.

### What this TDD addresses

Three complementary noise reduction layers, applied in sequence:

1. Confidence scoring with severity-specific thresholds
2. Enriched theme suppression with structured conclusions
3. Deterministic post-filtering for noise patterns

### What this TDD does not address (scope boundary)

- **Verification pass.** Bop re-evaluates each finding against the diff in a separate
  model call, filtering hallucinations. This is effective but doubles model cost per
  review. Remains available as a future enhancement if the three-layer strategy proves
  insufficient.
- **Weighted scoring / consensus merge.** Bop aggregates confidence across personas.
  Not needed at three personas; may become relevant if the persona count grows.
- **Configurable thresholds.** The confidence thresholds are hardcoded defaults. Config
  surface can be added if users need to tune them for their projects.

### Prior art from Bop

Bop's convergence solution includes structured theme extraction (conclusions + anti-patterns
+ dispute principles), confidence scoring with per-severity thresholds, verification passes,
and explicit false-positive guidance in prompts. This TDD adapts the key patterns without
the verification step — we're exploring whether the minimum intervention is sufficient.

---

## Architecture

### Layer 1 — Confidence Scoring + Prompt Hardening

#### Confidence on ReviewFinding

```typescript
interface ReviewFinding {
  // ... existing fields
  readonly confidence?: number; // 0-100, self-assessed by model
}
```

Default: 70 (backward compatibility for findings parsed from existing session files that
lack the field).

#### Confidence Thresholds

```typescript
interface ConfidenceThresholds {
  readonly critical: number;   // default: 50
  readonly high: number;       // default: 60
  readonly medium: number;     // default: 70
  readonly low: number;        // default: 80
}
```

The inverse relationship is deliberate: a critical finding is worth investigating even at
moderate confidence (cost of missing it is high), while a low finding must be near-certain
to justify the reviewer's attention (cost of noise exceeds the value of a speculative nit).

#### Prompt Changes

Three new sections injected into all review prompts (single-pass and persona):

1. **Response format** gains a `"confidence"` field (0-100).
2. **Confidence guidelines** define what each range means (90-100: confirmed, 70-89: very
   likely, 50-69: plausible, below 50: do not report).
3. **Anti-pattern guidance** explicitly lists what NOT to report: hedging, self-dismissing,
   speculative edge cases, over-engineering, style preferences, redundant safety,
   documented intentional patterns.

#### Severity Tightening

Medium severity changed from "maintainability concern, minor convention violation, potential
edge case" to "documented convention violation with specific rule reference, or edge case
with concrete trigger scenario." This raises the bar for the most noise-prone severity level.

#### filterByConfidence

Applied after dedup, before noise filter. Logs filtered count to stderr.

### Layer 2 — Enriched Theme Suppression

#### Structured Conclusions

```typescript
interface ThemeConclusion {
  readonly theme: string;       // "redirect prevention in fetch calls"
  readonly conclusion: string;  // "All fetch calls use redirect: 'error' intentionally"
  readonly antiPattern: string; // "Do not suggest removing redirect: 'error'"
}
```

#### ThemeResult

```typescript
interface ThemeResult {
  readonly themes: readonly string[];
  readonly conclusions: readonly ThemeConclusion[];
  readonly tokenUsage?: TokenUsage;
}
```

Carries both bare themes (backward compatibility) and structured conclusions (precise
suppression). The theme extraction prompt now requests `{ themes, conclusions }` format.

#### Fallback

If the model returns the old bare-array format, `parseStructuredThemes` falls back to
`{ themes: [...], conclusions: [] }`. Graceful degradation — never crashes.

#### Prompt Rendering

Structured conclusions render as explicit suppression rules:

```
## Previously Resolved Issues

### redirect prevention in HTTP calls
**Conclusion:** All fetch calls intentionally use redirect: 'error' to prevent credential leaks.
**Do NOT suggest:** removing redirect: 'error' or switching to follow mode.
```

Bare themes that don't have a corresponding conclusion render as bullet points below.

### Layer 3 — Deterministic Noise Filter

A new `src/agent/review/noise-filter.ts` module applies cheap regex-based patterns after
all model-based processing:

| Pattern | Matches |
|---------|---------|
| hedging | "This is correct", "The code correctly" in description |
| self-dismissing | "no action needed", "this is fine", "not necessarily a problem" |
| vague-speculation | "consider whether" without a concrete scenario |
| low-style | severity=low + category=style (always noise in practice) |

Returns `FilterResult` with the filtered findings, count, and per-reason breakdown for
logging.

---

## Pipeline Order

```
Persona review calls (parallel)
  → Within-session deduplication
  → Confidence threshold filtering    ← new
  → Deterministic noise filtering     ← new
  → Display / GitHub posting
```

Confidence filtering runs before noise filtering because confidence filtering is
model-assessed (may catch things regexes can't) while noise filtering is a safety net for
patterns the model emits despite instructions.

---

## Files

| File | Role |
|------|------|
| `src/agent/review/types.ts` | `confidence` on ReviewFinding, `ConfidenceThresholds`, `ThemeConclusion` |
| `src/agent/review/prompts.ts` | Confidence guidelines, anti-patterns, enriched theme rendering |
| `src/agent/review/agent.ts` | `filterByConfidence()`, confidence parsing in `normalizeFinding` |
| `src/agent/review/themes.ts` | Structured theme extraction, `ThemeResult` with conclusions |
| `src/agent/review/noise-filter.ts` | Deterministic post-filter |
| `src/cli/review.ts` | Pipeline wiring: confidence → noise → display |

---

## Decisions

1. **Three layers, not one.** No single mechanism eliminates all noise. Prompt guidance
   reduces generation; confidence filtering catches uncertain findings; regex catches
   patterns the model emits despite instructions. Each layer is cheap and complementary.

2. **Inverse severity/confidence thresholds.** Adopted from Bop. The insight is that the
   cost function differs by severity: missing a critical bug is expensive, while
   investigating a speculative nit is wasteful. The threshold encodes this asymmetry.

3. **No verification pass (yet).** Bop's verification step re-evaluates each finding
   against the diff. It works, but it doubles model cost. We're testing whether prompt
   hardening + confidence + deterministic filtering achieves similar convergence at lower
   cost. The door is explicitly left open.

4. **Structured conclusions over bare themes.** Bare theme strings are ambiguous — the
   model can interpret "redirect prevention" broadly enough to skip legitimate findings.
   Structured conclusions state exactly what was decided and what not to suggest, making
   suppression precise.

5. **Low + style = always filter.** In practice, low-severity style findings are always
   noise — naming opinions, formatting preferences, comment suggestions. If a style
   issue matters, it should be documented as a convention and reported at medium severity
   with a rule reference.

---

## Open Questions

1. **Are three layers sufficient without verification?** The v0.8.1 implementation is the
   experiment. If findings still don't converge on the next multi-round PR, verification
   should be the next addition.

2. **Should confidence thresholds be configurable?** Currently hardcoded. If different
   projects need different noise tolerances, a `review.confidence` config section would
   be straightforward to add.

3. **Should the noise filter patterns be extensible?** Currently hardcoded regex patterns.
   If projects develop their own noise patterns, a config-driven pattern list could help.
