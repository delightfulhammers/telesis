---
title: Core Concepts
description: The mental model behind Telesis
weight: 30
---

# Core Concepts

Telesis holds a specific worldview about how software should be built with AI. Understanding these concepts will help you use it effectively.

## The Spec Is the Source of Truth

Every decision Telesis makes traces back to your project's specification — the documents in `docs/`. When Telesis reviews code, it checks alignment with the architecture. When it detects drift, it measures deviation from the spec. When it plans work, it decomposes tasks against the requirements.

If the spec is wrong, you update the spec. You don't quietly let the implementation diverge. This is a deliberate constraint: it forces clarity about what you're building and why, which is the hardest part of software development.

## The Feedback Loop

Telesis operates a continuous feedback loop:

```
Define intent → Plan → Implement → Validate → Detect drift → Repair → Repeat
```

At each stage, Telesis holds the context that keeps the loop coherent. When something drifts, it doesn't just flag it — it knows *why* it's wrong relative to the original intent.

## Three Scopes of Development

Telesis connects three scopes that most tools treat as separate worlds:

**Inner loop** — fast, local feedback. You write code, stage changes, and get immediate review and drift detection. Commands like `telesis review` and `telesis drift` live here. They're meant to be fast, run frequently, and catch issues before they compound.

**Planning loop** — task decomposition and orchestration. You import work items from GitHub, decompose them into sequenced task plans, and dispatch agents to execute them. Commands like `telesis intake`, `telesis plan`, and `telesis dispatch` live here.

**Outer loop** — full pipeline orchestration. `telesis run` ties everything together: plan, execute, validate, commit, push, create a PR, close the issue. This is the "hands off the wheel" mode — autonomous within the constraints you've set, with human gates at the moments that matter.

## Living Documents

The documents Telesis generates are not artifacts that get written once and forgotten. They're living documents that evolve with the project:

- **VISION.md** is your project's north star. It changes rarely, but when it does, everything downstream should be re-evaluated.
- **PRD.md** captures requirements and user journeys. It grows as features are added and refined.
- **ARCHITECTURE.md** describes the current system design. It's updated as the structure evolves.
- **MILESTONES.md** is the development roadmap. Milestones are completed, new ones are added.
- **ADRs** (Architectural Decision Records) capture significant design decisions. They're immutable once accepted — if a decision is revisited, the original ADR is superseded by a new one.
- **TDDs** (Technical Design Documents) describe component-level design. They're written before implementation when possible, and serve as design contracts.
- **CLAUDE.md** is regenerated from all of the above. It's the context injection file that keeps AI assistants aligned.

## Drift

Drift is the central diagnostic concept in Telesis. It means: "the implementation has deviated from the spec." Telesis detects drift through a battery of checks — structural checks (are expected directories present?), convention checks (are SDK imports contained to the right module?), consistency checks (does the milestone reference a TDD that exists?), and freshness checks (is CLAUDE.md up to date?).

Drift detection is not linting. Linting checks code style. Drift detection checks whether your code matches your *stated intent*. A perfectly linted codebase can still be badly drifted if it doesn't match the architecture document.

## Agents and the Swarm

Telesis coordinates a swarm of specialized agents, each responsible for a different aspect of development intelligence:

- The **Reviewer** evaluates code quality, correctness, and alignment with conventions.
- **Review Personas** (security, architecture, correctness) provide multi-perspective analysis.
- The **Planner** decomposes work items into sequenced task graphs.
- The **Validator** checks whether task output meets acceptance criteria.
- **Oversight Observers** watch agent sessions in real time and flag concerns.
- The **Chronicler** extracts insights and notes from agent sessions automatically.

These agents don't share a single prompt or context window. They're specialized, with focused responsibilities and access to different slices of project context.

## Human-in-the-Loop

Telesis is designed to operate autonomously within defined boundaries, but it pauses for human judgment at critical moments:

- **Plan approval** — before executing a decomposed plan, Telesis shows you what it intends to do and waits for confirmation (unless you've configured auto-approval).
- **Milestone gates** — before marking a milestone complete, all checks must pass and you confirm the acceptance criteria are met.
- **Escalation** — when a task fails validation after all retries, it's escalated to you rather than silently abandoned.
- **Architectural decisions** — significant design choices surface through the ADR process, not buried in commit messages.

## Memory

Context doesn't reset between sessions, PRs, or milestones. Telesis accumulates knowledge about your project over its lifetime:

- **Telemetry** tracks every model call — tokens, duration, component — so you always know what you're spending.
- **Development notes** capture quick observations tagged for later retrieval.
- **The design journal** records longer-form thinking about architectural decisions and design trade-offs.
- **Review sessions** persist findings across rounds, enabling convergence detection (is this issue being fixed or ignored?).
- **Dismissals** remember which review findings you've triaged, so they don't resurface unnecessarily.
- **Dispatch sessions** log every agent interaction for replay and analysis.

This persistent memory is what separates Telesis from tools that treat each interaction as stateless. It remembers what was tried and rejected, what decisions were made and why, and what the project looked like at each milestone.

## Principles

Six principles guide Telesis's design:

1. **Opinionated defaults, configurable everything.** The happy path works before you configure anything. The first `telesis init` should be useful in under five minutes.

2. **The spec is the source of truth.** Every agent decision traces back to the spec. Drift is defined as deviation from it.

3. **Human-in-the-loop at the right moments.** Autonomous within milestones. Pauses for human judgment at gates, architectural decisions, and irreconcilable conflicts.

4. **Memory is a first-class feature.** Context accumulates over the project's lifetime and informs every decision.

5. **Telesis bridges the inner and outer loop.** Local development needs low friction. CI/CD needs rigor. Telesis is the shared context and control system that keeps both loops coherent.

6. **Documentation is a byproduct, not a task.** The provenance trail, the decision log, the living spec — these emerge from the process, not from a separate documentation sprint.
