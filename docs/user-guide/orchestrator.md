---
title: The Orchestrator
description: Automated lifecycle management from work item to shipped milestone
weight: 35
---

# The Orchestrator

The orchestrator is a deterministic state machine that enforces the full development
lifecycle. It runs inside the daemon process and drives work from intake through shipped
milestone, surfacing only meaningful decisions to the human.

## How It Works

The orchestrator maintains a 10-state lifecycle:

```
idle → intake → triage → milestone_setup → planning → executing →
post_task → reviewing → milestone_check → milestone_complete → idle
```

Each state transition has enforced preconditions — the orchestrator **cannot skip steps**.
At specific points it surfaces decisions for human approval; everything else is automatic.

## Human Decision Points

There are 7 decision points per milestone:

| Decision | State | What you decide |
|----------|-------|-----------------|
| Triage approval | `triage` | Which work items to include, milestone scope |
| Milestone approval | `milestone_setup` | Milestone definition, TDD (if recommended) |
| Plan approval | `planning` | Task breakdown and ordering |
| Escalation | `executing` | What to do when a task fails after retries |
| Convergence failure | `reviewing` | What to do when review won't converge |
| Criteria confirmation | `milestone_check` | Manual acceptance criteria met? |
| Ship confirmation | `milestone_complete` | Commit, tag, push? |

## Running the Orchestrator

To advance the orchestrator manually:

```
telesis orchestrator run
```

This drives the state machine forward in a loop — calling intake, planning, dispatch,
review, and milestone operations as needed — until it reaches a decision point that
requires human input, or returns to idle. Output shows each state transition as it happens.

The typical workflow:

1. Run `telesis orchestrator run` — it advances and creates a decision
2. Review the pending decision with `telesis orchestrator status`
3. Approve or reject: `telesis orchestrator approve <id>`
4. Run again: `telesis orchestrator run` — it picks up from where it stopped
5. Repeat until the milestone is complete

## Interacting with Decisions

When the orchestrator needs your input, it sends a macOS notification and queues the
decision in `.telesis/decisions/`.

### Check status

```
telesis orchestrator status
```

Shows current state, active milestone, progress, and any pending decisions.

### Approve a decision

```
telesis orchestrator approve <decision-id>
```

The decision ID is shown in the status output. Prefix matching is supported (8+ characters).

#### Triage approval with metadata

When approving a triage decision, you can provide milestone metadata and select which
work items to include:

```
telesis orchestrator approve <id> \
  --items wi-abc123,wi-def456 \
  --milestone-name "Auth Improvements" \
  --milestone-id "0.25.0" \
  --goal "Strengthen authentication and fix password reset"
```

| Flag | Description |
|------|-------------|
| `--items <ids>` | Comma-separated work item IDs to include (default: all) |
| `--milestone-name <name>` | Milestone name |
| `--milestone-id <version>` | Milestone version (e.g., "0.25.0") |
| `--goal <text>` | Milestone goal description |

If you omit `--items`, all work items from intake are included. The status output shows
the LLM's suggested groupings to help you decide the scope.

### Reject a decision

```
telesis orchestrator reject <decision-id> --reason "Tasks are too coarse"
```

The orchestrator uses your feedback to adjust (e.g., re-plan with your guidance).

## Preflight Checks

The orchestrator provides preflight checks that can be used as Claude Code hooks to
gate git operations:

```
telesis orchestrator preflight
```

Checks:
- Milestone entry exists in MILESTONES.md
- Review has converged (orchestrator past reviewing state)
- Quality gates pass
- No blocking decisions pending

Exits with code 1 on failure, which blocks the hook.

### Claude Code Hook

A hook is installed at `.claude/settings.json` that automatically runs preflight before
every `git commit` in Claude Code. If preflight fails, the commit is blocked and Claude
receives the failure message as feedback.

The hook script is at `.claude/hooks/git-preflight.sh`. It only intercepts `git commit`
commands (not other git operations), using an anchored regex to avoid false positives on
commands like `git commit-graph`.

## LLM Judgment Calls

The orchestrator makes targeted LLM calls (Haiku-class, cheap) at two points:

- **Triage**: suggests how to group work items into milestones
- **Milestone setup**: assesses whether the milestone needs a TDD

These are suggestions — the human makes the final decision via the approval flow.

## Persistence and Recovery

Orchestrator state is persisted to `.telesis/orchestrator.json`. If the daemon crashes,
the orchestrator resumes from the last saved state on restart. Decisions are persisted
individually in `.telesis/decisions/`.

## Starting the Orchestrator

The orchestrator starts automatically when the daemon starts:

```
telesis daemon start
```

It stops when the daemon stops, persisting final state.
