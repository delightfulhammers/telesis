---
title: Telemetry & Cost Tracking
description: Understanding model usage and cost
weight: 320
---

# Telemetry & Cost Tracking

Every model call Telesis makes is logged to `.telesis/telemetry.jsonl`. This gives you complete visibility into token usage, cost, and which components are consuming your API budget.

## What's Tracked

Each model call records:

| Field | Description |
|---|---|
| `id` | Unique call identifier |
| `timestamp` | ISO 8601 timestamp |
| `component` | Which Telesis feature made the call (e.g., `interview`, `generate:vision`, `review`, `planner`, `validator`) |
| `model` | Model used (e.g., `claude-sonnet-4-6`) |
| `provider` | API provider (`anthropic`) |
| `inputTokens` | Tokens sent to the model |
| `outputTokens` | Tokens returned by the model |
| `cacheReadTokens` | Tokens served from prompt cache (if applicable) |
| `cacheWriteTokens` | Tokens written to prompt cache (if applicable) |
| `durationMs` | Wall-clock duration of the call |
| `sessionId` | Session identifier for grouping related calls |

## Viewing Usage

```bash
telesis status
```

The status command aggregates telemetry across all calls and displays total input tokens, total output tokens, call count, and estimated cost.

## Cost Derivation

Costs are **derived at display time**, not stored. This is an intentional design decision — token counts are immutable facts, but pricing changes. By storing tokens and deriving cost from the current pricing configuration, Telesis ensures cost estimates remain accurate even after pricing changes.

Pricing is configured in `.telesis/pricing.yml`:

```yaml
models:
  claude-sonnet-4-6:
    inputCost: 0.003        # Per 1K input tokens
    outputCost: 0.015       # Per 1K output tokens
    cacheReadCost: 0.0003   # Per 1K cache read tokens
    cacheWriteCost: 0.0075  # Per 1K cache write tokens
  claude-haiku-4-5-20251001:
    inputCost: 0.00008
    outputCost: 0.0004
```

The cost formula for each call:

```
cost = (inputTokens / 1000 × inputCost)
     + (outputTokens / 1000 × outputCost)
     + (cacheReadTokens / 1000 × cacheReadCost)
     + (cacheWriteTokens / 1000 × cacheWriteCost)
```

## Telemetry by Component

The `component` field lets you understand where your tokens are going. Common components:

| Component | Feature |
|---|---|
| `interview` | `telesis init` conversation |
| `generate:vision` | VISION.md generation |
| `generate:prd` | PRD.md generation |
| `generate:architecture` | ARCHITECTURE.md generation |
| `generate:milestones` | MILESTONES.md generation |
| `review` | Code review analysis |
| `review:judge` | LLM judge for dismissal re-raises |
| `review:dedup` | Cross-persona deduplication |
| `review:themes` | Theme extraction |
| `planner` | Plan decomposition |
| `validator` | Task validation |
| `oversight:reviewer` | Reviewer observer |
| `oversight:architect` | Architect observer |
| `oversight:chronicler` | Chronicler observer |

## Error Handling

Telemetry write failures are logged to stderr but never abort the operation. If `.telesis/telemetry.jsonl` can't be written (permissions, disk full, etc.), Telesis continues working — losing telemetry is preferable to failing the actual task.

## Storage Format

Telemetry uses JSONL (JSON Lines) — one record per line, append-only. This format is efficient for streaming writes and simple to parse with standard tools:

```bash
# Count total model calls
wc -l .telesis/telemetry.jsonl

# Find the most expensive calls
cat .telesis/telemetry.jsonl | jq -s 'sort_by(.outputTokens) | reverse | .[0:5]'

# Total tokens by component
cat .telesis/telemetry.jsonl | jq -s 'group_by(.component) | map({component: .[0].component, totalInput: (map(.inputTokens) | add), totalOutput: (map(.outputTokens) | add)})'
```
