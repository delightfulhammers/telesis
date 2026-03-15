# Orchestrator State Machine — Working Spec

*Draft: 2026-03-15*
*Status: Under discussion — not yet a TDD or milestone*

---

## What This Document Is

A working spec for the orchestrator — the missing piece that turns Telesis from a toolbox
into a feedback and control system. This is meant to be iterated on in conversation before
any code is written.

---

## The Problem

Telesis has all the pieces: intake, planning, dispatch, review, drift detection, milestone
validation, quality gates, documentation generation. But nothing ensures they happen in the
right order. Today, the human (Brandon) is the orchestrator — and both he and the coding
agents are inconsistent at it.

The existing `runPipeline` covers the inner loop for a single work item (plan → execute →
quality gates → review → commit). But the outer loop is entirely manual:

- Deciding what to work on next
- Creating milestone entries before coding starts
- Writing TDDs for new subsystems
- Ensuring review converges (not just one round)
- Running the milestone completion workflow after all criteria are met
- Keeping documentation current
- Tracking what's in progress, what's blocked, what's done

The orchestrator owns this outer loop.

---

## Design Principles

1. **The orchestrator is the process.** It doesn't advise — it enforces. Steps cannot be
   skipped.

2. **Coding agents are the inner loop.** They receive tasks and execute. They never need to
   know about milestones, TDDs, version bumps, or convergence. That's all orchestrator
   responsibility.

3. **Humans make decisions, not keystrokes.** The orchestrator surfaces meaningful choices
   (approve this plan? accept this milestone?) and handles everything else.

4. **Asynchronous by default.** The orchestrator queues decisions, notifies the human, and
   continues on other work. It does not block waiting for answers.

5. **Observable.** Every state transition is an event on the daemon bus. The TUI, OS
   notifications, and MCP notifications are all consumers of this stream.

---

## Resolved Design Decisions

These were discussed and decided during the spec drafting process (2026-03-15).

### Where does the orchestrator run?

**Decision:** Inside the daemon process. They are coupled.

**Rationale:** The daemon is already the long-running process that watches, listens, and
emits events. The orchestrator reacts to those events and drives the next step. Separating
them creates a coordination problem for no benefit. Telesis is useful even without the
daemon running (CLI still works). It would be surprising to stop the daemon but have the
orchestrator still active.

### How smart is the orchestrator?

**Decision:** LLM-augmented state machine. Deterministic flow with targeted LLM calls at
specific judgment points.

**Rationale:** A pure state machine can't handle ambiguity ("does this need a TDD?"). A
full LLM agent would reproduce the "skip steps" problem we're solving — an LLM controlling
flow is the failure mode, not the solution. The state machine always follows the sequence,
never skips steps. At points requiring judgment, it makes short, focused LLM calls (cheap —
Haiku-class models for most). The LLM never controls the flow; it only answers questions the
state machine asks.

**Three distinct roles:**
- **Orchestrator** (state machine + targeted LLM calls) — enforces process, makes judgment
  calls, sequences everything
- **Coding agent** (Claude Code via dispatch) — receives tasks, implements them. Knows
  nothing about milestones, TDDs, convergence
- **Human** — makes the ~7 meaningful decisions per milestone

---

## Lifecycle: From Work Item to Shipped Milestone

### States

```
                          ┌─────────────────────┐
                          │    INTAKE            │
                          │  Work items arrive   │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │    TRIAGE            │
                          │  Prioritize, group   │
                          │  into milestones     │
                          └──────────┬──────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │    MILESTONE_SETUP              │
                    │  Create milestone entry         │
                    │  Write TDD (if new subsystem)   │
                    │  Define acceptance criteria      │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │    PLANNING                     │
                    │  Decompose into tasks           │
                    │  Present plan for approval      │
                    └───────────────┬────────────────┘
                                    │  [human approves]
                                    ▼
                    ┌────────────────────────────────┐
                    │    EXECUTING                    │
                    │  For each task:                 │
                    │    dispatch → validate →        │
                    │    correct (if needed)          │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │    POST_TASK                    │
                    │  After each task completes:     │
                    │    format, lint, test, build    │
                    │    (fix if failures)            │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │    REVIEWING                    │
                    │  Run review                     │
                    │  Fix findings                   │
                    │  Re-review                      │
                    │  Repeat until convergence       │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │    MILESTONE_CHECK              │
                    │  Are all acceptance criteria    │
                    │  satisfied?                     │
                    │  Drift clean? Tests pass?       │
                    └───────────────┬────────────────┘
                                    │  [auto or human confirms]
                                    ▼
                    ┌────────────────────────────────┐
                    │    MILESTONE_COMPLETE           │
                    │  Version bump                   │
                    │  Update MILESTONES.md           │
                    │  Update TDD status              │
                    │  Update PRD, ARCHITECTURE       │
                    │  Update user docs (if needed)   │
                    │  Update ops runbooks (if needed) │
                    │  Regenerate CLAUDE.md           │
                    │  Commit, tag, push              │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                               ┌─────────┐
                               │  DONE   │
                               └─────────┘
```

### State Descriptions

#### INTAKE
- **Trigger:** Periodic sync from GitHub (or manual `telesis intake github`)
- **Automatic:** Yes — daemon schedules periodic sync
- **Output:** Work items in `.telesis/intake/` with status `pending`
- **Transition:** When new items arrive → TRIAGE

#### TRIAGE
- **What happens:** Orchestrator groups related work items, proposes a milestone scope
- **Human decision:** Which items to include? What's the milestone goal?
- **Automatic parts:** Suggest grouping based on labels, dependencies, size estimates
- **Transition:** Human approves scope → MILESTONE_SETUP

#### MILESTONE_SETUP
- **What happens:**
  - Create milestone entry in MILESTONES.md (status: In Progress)
  - Determine if new subsystem → write TDD (LLM judgment call)
  - Define acceptance criteria (LLM-assisted, human-approved)
- **Human decision:** Approve milestone definition, approve TDD
- **Transition:** Milestone and TDD (if needed) approved → PLANNING

#### PLANNING
- **What happens:** Decompose milestone work items into tasks via LLM
- **Human decision:** Approve plan (task graph, dependencies, ordering)
- **Transition:** Plan approved → EXECUTING

#### EXECUTING
- **What happens:** For each task in topological order:
  1. Dispatch to coding agent (Claude Code via acpx)
  2. Validate output
  3. Correct if validation fails (retry loop)
  4. Escalate to human if retries exhausted
- **Human decision:** Only on escalation
- **Transition:** All tasks complete → POST_TASK

#### POST_TASK
- **What happens:** Run quality gates (format, lint, test, build)
- **Automatic:** Yes — fix formatting issues automatically, re-run on failure
- **Human decision:** Only if gates fail repeatedly
- **Transition:** All gates pass → REVIEWING

#### REVIEWING
- **What happens:**
  1. Stage changes
  2. Run `telesis review`
  3. Dispatch fixes for high/critical findings to coding agent
  4. Re-stage
  5. Run review again
  6. Repeat until convergence (new + persistent findings ≤ threshold)
- **Automatic:** Yes — the review-fix-review loop is fully automated
- **Human decision:** Only if convergence fails after N rounds
- **Transition:** Review converged → MILESTONE_CHECK

#### MILESTONE_CHECK
- **What happens:** Run `telesis milestone check` — drift clean, tests pass, all criteria
- **Automatic:** Automated criteria checked automatically
- **Human decision:** Manual acceptance criteria confirmation
- **Transition:** All checks pass → MILESTONE_COMPLETE

#### MILESTONE_COMPLETE
- **What happens:**
  1. Run `telesis milestone complete` (version bump, doc updates, context regen)
  2. Update PRD if new commands/capabilities
  3. Update ARCHITECTURE if new modules
  4. Update user documentation (if project has user-facing docs)
  5. Update ops runbooks (if project is a deployed service)
  6. Commit all changes
  7. Tag release
  8. Push
- **Human decision:** Final "ship it?" confirmation before push
- **Transition:** Pushed → DONE

---

## Decision Points Summary

| Decision | Who | When | Blocking? |
|----------|-----|------|-----------|
| Which work items to include in milestone | Human | TRIAGE | Yes |
| Approve milestone definition + TDD | Human | MILESTONE_SETUP | Yes |
| Approve task plan | Human | PLANNING | Yes |
| Escalated task (retries exhausted) | Human | EXECUTING | Yes |
| Review won't converge (N rounds exceeded) | Human | REVIEWING | Yes |
| Manual acceptance criteria met? | Human | MILESTONE_CHECK | Yes |
| Ship it? (final push confirmation) | Human | MILESTONE_COMPLETE | Yes |

Everything else is automatic. That's 7 human decision points per milestone, most of which
are "looks good, proceed" approvals.

---

## Enforcement Mechanisms

### 1. State Machine Invariants (orchestrator-internal)

The orchestrator refuses to advance to the next state until preconditions are met:

- Cannot enter PLANNING without a milestone entry in MILESTONES.md
- Cannot enter EXECUTING without an approved plan
- Cannot enter REVIEWING without quality gates passing
- Cannot enter MILESTONE_COMPLETE without review convergence + milestone check passing
- Cannot push without all doc updates done

These are hard gates in the orchestrator's state machine. No tool, no hook — just code that
won't proceed.

### 2. Claude Code Hooks (coding agent guardrails)

When the orchestrator dispatches to a coding agent, it can install hooks:

- **PreToolCall(git commit):** Run `telesis preflight` — verify review has converged,
  quality gates pass, milestone entry exists. Block if not.
- **PreToolCall(git push):** Run `telesis push-preflight` — verify all milestone
  completion steps done. Block if not.

These catch the case where a coding agent tries to skip steps on its own.

### 3. MCP Notifications (context injection)

The orchestrator pushes state into the coding agent's context:

- "You are working on task 3/5 of milestone v0.22.0"
- "When this task is done, do NOT commit. The orchestrator will handle review and commit."
- "Current review status: round 2, 3 findings remaining"

This shapes the agent's behavior proactively rather than reactively.

### 4. OS Notifications (human awareness)

Non-blocking notifications for:

- "Plan ready for approval" (PLANNING → needs human)
- "Milestone ready for review" (MILESTONE_CHECK → needs human)
- "Task escalated — human input needed" (EXECUTING → escalation)
- "Milestone v0.22.0 shipped" (DONE)

---

## What the Orchestrator Observes

The daemon event bus provides the sensory surface. The orchestrator subscribes to all events
and maintains a projection of current state:

| Event | Orchestrator learns... |
|-------|----------------------|
| `intake:sync:completed` | New work items available → consider TRIAGE |
| `plan:approved` | Plan ready → can start EXECUTING |
| `dispatch:session:completed` | Task done → check if all tasks complete |
| `dispatch:session:failed` | Task failed → retry or escalate |
| `validation:passed` | Task validated → advance to next task |
| `validation:escalated` | Retries exhausted → surface to human |
| `pipeline:quality_gate_passed` | Gates pass → advance to REVIEWING |
| `pipeline:quality_gate_failed` | Gate failed → attempt auto-fix or escalate |
| `pipeline:review_passed` | Review converged → advance to MILESTONE_CHECK |
| `pipeline:review_failed` | Review has findings → dispatch fixes, re-review |
| `fs:file:modified` on MILESTONES.md | Docs updated → check if milestone complete |

---

## Open Questions

1. **Granularity of milestones vs. tasks.** The current pipeline (`runPipeline`) operates on
   a single work item. The orchestrator operates on milestones which may contain multiple
   work items. How do we handle multi-work-item milestones? Sequential? Parallel?

2. **Review convergence criteria.** What exactly constitutes "converged"? Current thinking:
   new + persistent findings ≤ N (where N is configurable, default maybe 2-3 low/medium).
   Does this need to be smarter?

3. **Multi-agent coordination.** When the orchestrator dispatches a task to Claude Code,
   can it also run oversight observers simultaneously? The daemon infrastructure exists
   but the orchestrator would need to coordinate them.

4. **Recovery from partial failure.** If the daemon/orchestrator crashes mid-milestone, how
   does it resume? The pipeline already has `PipelineState` for resumability — does the
   orchestrator need similar persistence?

5. **The TUI interaction model.** When the orchestrator surfaces a decision, what does
   the TUI look like? A queue of pending decisions? A chat-like interface? A dashboard
   with action buttons?

---

## Future Work (decided, deferred)

These are real requirements that should be implemented after the core state machine is
working. They were discussed during spec drafting and intentionally parked.

1. **User documentation generation.** Some projects need user-facing docs (manuals, guides).
   The MILESTONE_COMPLETE state should conditionally trigger user doc updates when the
   project configuration indicates user docs exist. Shape TBD — likely a `docs.userDocs`
   config section pointing to doc paths.

2. **Ops runbooks.** Deployed services may need operational runbooks updated when behavior
   changes. Same pattern as user docs — conditional on project type. Shape TBD.

3. **Configurable HITL thresholds.** Each of the 7 decision points should eventually be
   configurable between "always require human" and "auto-approve." A team that trusts the
   planner might auto-approve plans. "Ship it?" might always need a human. The
   configuration would be per-decision-point in `.telesis/config.yml`, defaulting to
   "always require human" for safety.

4. **Configurable review convergence thresholds.** The definition of "converged" should be
   tunable per-project. Default: new + persistent ≤ 3, severity ≤ medium.

---

## Relationship to Existing Code

| Existing module | Role in orchestrated world |
|-----------------|---------------------------|
| `src/pipeline/run.ts` | Inner loop for single work item execution |
| `src/daemon/` | Host process for orchestrator; event bus, fs watching |
| `src/oversight/` | Observer agents attached to dispatch sessions |
| `src/intake/` | Work item import (INTAKE state) |
| `src/plan/` | Task decomposition and execution (PLANNING + EXECUTING states) |
| `src/agent/review/pipeline.ts` | Review execution (REVIEWING state) |
| `src/milestones/` | Milestone check + complete (MILESTONE_CHECK + MILESTONE_COMPLETE) |
| `src/drift/` | Drift detection (part of MILESTONE_CHECK) |
| `src/context/` | CLAUDE.md generation (part of MILESTONE_COMPLETE) |
| `src/mcp/` | Tool interface — orchestrator could use MCP tools internally |

The orchestrator lives inside `src/daemon/` (or a new `src/orchestrator/` that the daemon
imports — TBD based on size). It sequences calls to all of the above. It doesn't replace
any of them — it's the conductor, they're the instruments.
