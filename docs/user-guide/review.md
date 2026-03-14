---
title: Code Review
description: Multi-perspective code review with personas, dismissals, and convergence detection
weight: 50
---

# Code Review

`telesis review` performs AI-powered code review against your project's conventions, architecture, and stated intent. It goes beyond style checking — it evaluates whether your changes align with what you said you're building.

## Basic Usage

Review staged changes:

```bash
telesis review
```

Review all changes (staged and unstaged):

```bash
telesis review --all
```

Review against a specific ref:

```bash
telesis review --ref main
telesis review --ref main...HEAD
```

The `--ref` option is particularly useful in CI or before opening a PR, where you want to review all changes since the branch diverged from main.

## Review Modes

Telesis supports two review modes.

### Single-Pass Mode

```bash
telesis review --single
```

A single review pass covering all categories: bugs, security, architecture, maintainability, performance, and style. This is faster and uses fewer tokens. Good for quick checks during development.

### Persona Mode (Default)

```bash
telesis review
```

When run without `--single`, Telesis uses multiple review personas — specialized perspectives that each focus on a different concern. The built-in personas are:

- **Security** — vulnerabilities, input validation, authentication/authorization issues, data exposure
- **Architecture** — structural violations, module boundary crossings, design intent alignment
- **Correctness** — type safety, logic errors, edge cases, error handling

Each persona reviews the diff independently, then findings are deduplicated across personas (keeping the highest severity when duplicates are found).

You can select specific personas:

```bash
telesis review --personas security,correctness
```

### Custom Personas

Configure additional personas in `.telesis/config.yml`:

```yaml
review:
  personas:
    - slug: performance
      model: claude-sonnet-4-6
    - slug: accessibility
```

## Understanding Findings

Each finding includes:

- **Severity** — `critical`, `high`, `medium`, or `low`
- **Category** — `bug`, `security`, `architecture`, `maintainability`, `performance`, or `style`
- **Path** — the file and line range where the issue was found
- **Description** — what the issue is
- **Suggestion** — how to fix it
- **Confidence** — a self-assessed score (0–100) indicating how sure the model is about the finding
- **Persona** — which reviewer perspective generated the finding (in persona mode)

### Severity Filtering

Show only findings at or above a severity threshold:

```bash
telesis review --min-severity high
```

This filters out medium and low findings, showing only high and critical issues.

### Exit Codes

`telesis review` exits with code 1 when critical or high severity findings are present. This makes it usable as a CI gate — a non-zero exit fails the build.

## The Review Pipeline

Behind the scenes, a review goes through several processing stages:

1. **Diff resolution** — parse the git diff into structured changed files
2. **Context assembly** — read VISION.md, ARCHITECTURE.md, and project conventions
3. **Review** — single-pass or persona-based LLM analysis
4. **Deduplication** — merge similar findings across personas (LLM-based, keeps highest severity)
5. **Confidence filtering** — remove findings below the confidence threshold for their severity level
6. **Noise filtering** — remove findings with hedging language ("might be an issue"), self-dismissals ("but this probably doesn't matter"), or speculative suggestions
7. **Full-file verification** — read the actual source file to confirm findings (not just the diff hunk)
8. **Dismissal filtering** — remove findings you've previously dismissed
9. **Theme suppression** — suppress findings covered by theme conclusions from prior review sessions
10. **Convergence detection** — label findings as new, persistent, or resolved compared to prior reviews

This pipeline is designed to reduce noise. Raw LLM review output contains a significant amount of false positives, hedging, and low-confidence speculation. The pipeline filters aggressively so that what reaches you is actionable.

### Confidence Thresholds

Findings are filtered by confidence score, with thresholds that vary by severity. In round 2 and beyond (when the model has seen prior session themes), thresholds are lowered to catch issues that may have been borderline in earlier rounds:

| Severity | Round 1 Threshold | Round 2+ Threshold |
|---|---|---|
| Critical | 50 | 40 |
| High | 60 | 50 |
| Medium | 70 | 60 |
| Low | 80 | 70 |

## Dismissals

When a finding is not actionable — a false positive, a style preference, or something already addressed — you can dismiss it:

```bash
telesis review dismiss <finding-id> --reason false-positive
telesis review dismiss <finding-id> --reason not-actionable --note "Intentional for backwards compat"
```

### Dismissal Reasons

- `false-positive` — the model was wrong; this isn't a real issue
- `not-actionable` — it's a real observation but can't be fixed in scope
- `already-addressed` — fixed in another branch or PR
- `style-preference` — you disagree with the suggestion

Dismissals are stored in `.telesis/dismissals.jsonl` and persist across review sessions. Future reviews automatically filter findings that match dismissed patterns. The filtering uses both deterministic matching (same path, category, similar description) and an LLM judge to detect semantic re-raises — the same issue rephrased differently.

### Managing Dismissals

List all dismissals:

```bash
telesis review dismissals
telesis review dismissals --json
```

View dismissal statistics and noise patterns:

```bash
telesis review dismissal-stats
```

This shows aggregated data about your dismissal patterns — which categories generate the most false positives, which personas are noisiest, and where the model consistently misses the mark. This is useful for tuning your review configuration.

## Convergence Detection

When you review the same codebase across multiple sessions (multiple rounds of review on the same branch), Telesis tracks whether findings are new, persistent, or resolved:

- **New** — appeared for the first time in this round
- **Persistent** — appeared in a prior round and is still present
- **Resolved** — appeared in a prior round but is no longer detected

Convergence detection uses fuzzy word-bag similarity (Jaccard index) to match findings across sessions, since LLM output is not deterministic — the same issue may be described slightly differently each time.

After each round, Telesis displays a convergence summary showing how many findings are new versus persistent versus resolved. A healthy review loop shows persistent findings decreasing over rounds.

### Convergence Labels

Starting from round 2, each finding in the output is labeled `[new]` or `[recurring]` so you can see at a glance which issues just appeared and which have persisted from prior rounds:

```
  ✗ [high] bug — src/auth/middleware.ts:10-15 [recurring]
  ✗ [medium] security — src/api/handler.ts:42-50 [new]
```

Labels only appear in live review output (round 2+). They are excluded from `--show` (historical sessions) and `--json` (programmatic consumers compute labels from session data).

### Plateau Detection

When 80% or more of findings are recurring and the review has reached round 3 or beyond, Telesis detects a plateau and recommends stopping:

```
Review has plateaued — 80%+ of findings are recurring. Consider dismissing or stopping.
```

The round 3 minimum prevents false positives — on round 2, even a single persistent finding could appear as 100% recurring, which isn't meaningful signal. A genuine plateau means the review loop has converged and additional rounds are unlikely to surface new issues.

### Active Theme Filtering

Themes extracted from prior review sessions are filtered at display time against the current round's findings. If no current finding relates to a theme (measured by word-bag similarity), the theme is considered stale and excluded from the output. This prevents the themes line from showing concerns that have already been resolved.

## Review Sessions

Every review is saved as a session in `.telesis/reviews/`. You can browse past sessions:

```bash
telesis review --list
```

And view a specific session's findings:

```bash
telesis review --show <session-id>
```

Sessions record the full context: which files were reviewed, which personas were used, the model and token usage, duration, and all findings with their metadata.

## GitHub Integration

Post review findings as inline PR comments:

```bash
telesis review --github-pr
```

This posts findings as line-level comments on the current PR. The posting is idempotent — running it again won't create duplicate comments. Finding IDs are embedded in comment markers for correlation.

Sync dismissals from GitHub PR review threads:

```bash
telesis review sync-dismissals --pr 42
```

This imports dismissal signals from GitHub — when reviewers mark comments as resolved or reply with acknowledgments — and converts them into local dismissals.

Post dismissal replies back to GitHub:

```bash
telesis review sync-replies --pr 42
```

See [GitHub Integration]({{< relref "github-integration" >}}) for the full workflow.

## Skipping Processing Steps

For debugging or specific workflows, you can skip individual pipeline stages:

```bash
telesis review --no-dedup     # Skip cross-persona deduplication
telesis review --no-themes    # Skip theme extraction from prior sessions
telesis review --no-verify    # Skip full-file verification
```

These flags are rarely needed in normal use. They're primarily useful when investigating why a specific finding is or isn't appearing.

## JSON Output

For programmatic consumption:

```bash
telesis review --json
```

This outputs findings as a JSON array, suitable for piping to other tools or CI integrations.
