# v0.2.1 Validation Results

**Date:** 2026-03-09
**Fixture:** tic-tac-toe-interview.json
**Model:** claude-sonnet-4-6

## Eval Suite Scores

| Metric | Score |
|--------|-------|
| **Overall** | **72%** |
| VISION.md | 100% (completeness 100%, specificity 100%, actionability 100%) |
| PRD.md | 100% (completeness 100%, specificity 100%, actionability 100%) |
| ARCHITECTURE.md | 67% (completeness 0%, specificity 100%, actionability 100%) |
| MILESTONES.md | 87% (completeness 60%, specificity 100%, actionability 100%) |
| Coverage (global) | 50% |
| Consistency (global) | 45% |

## Qualitative Assessment (Issues #15–#19)

### #15 — Generic VISION.md principles: FIXED

Principles are now project-specific decision heuristics, not feature labels:
- "Correctness of game logic is non-negotiable; everything else can iterate"
- "When choosing between configurability and a sensible default, choose the default"
- "Immutable state is the rule, not the optimization"
- "Scope is a feature"
- "Real-time sharing must require nothing from the recipient"
- "Performance constraints are design inputs, not benchmarks to check at the end"

Each principle guides ambiguous decisions rather than restating features.

### #16 — Config extraction language normalization: PROMPT FIXED

The extraction prompt now instructs the model to record languages, not frameworks.
Not directly tested in this validation run (config extraction not exercised).

### #17 — ARCHITECTURE.md over-specification: MOSTLY FIXED

The architecture does not fabricate unmentioned frameworks (no Express, no Jest —
the v0.2.0 output included both). However, cloudflared is stated definitively in
the architecture diagram despite the developer saying "cloudflared or similar."
The decided-vs-suggested instruction had partial effect.

### #19 — PRD out-of-scope section: FIXED

The PRD includes a detailed "Out of Scope" section listing all 6 exclusions from
the interview: PvP, mobile app, user accounts, variable board sizes, tournaments,
IE support.

## Eval Suite Calibration Issues Identified

These are false negatives in the eval suite — document quality is high but scores
are dragged down by evaluator limitations:

1. **Architecture completeness: 0%** — Generated doc uses numbered headings
   ("## 1. System Overview") which don't match the regex expecting "## System Overview".
   The section content is present and substantive.

2. **Coverage: 50%** — Bigram matching produces excessive false negatives. Conversational
   fragments like "twist adapts", "gets harder", "easy gets" are not meaningful topics
   but still count as misses. The coverage evaluator needs better topic extraction
   (the model-assisted topic extraction in `extractTopics` does this well, but the
   coverage evaluator uses raw bigram extraction from the interview transcript instead).

3. **Consistency: 45%** — Name extractor reports "tic-tac-toe ai" as inconsistent
   across documents when all four documents actually use the same project name.
   False positive from the name comparison logic.

## Comparison to v0.2.0

No recorded baseline exists for v0.2.0, but the qualitative issues from v0.2.0
Phase 6 validation are resolved:

| Issue | v0.2.0 | v0.2.1 |
|-------|--------|--------|
| Generic principles | "Adaptive Challenge", "Zero-Friction Sharing" | Decision heuristics with rationale |
| Architecture fabrication | Express, localtunnel, Jest, Playwright | Only discussed technologies |
| PRD out-of-scope | Missing | Present, 6 items |
| Language normalization | "React" recorded as language | Prompt instructs language, not framework |

## Future Work

The eval suite calibration issues above should be tracked for a future milestone.
They are measurement problems, not document quality problems.
