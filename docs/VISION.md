# Telesis — Vision Document
*By Delightful Hammers*
*Draft: 2026-03-07*

---

## The Name

**Telesis** (noun): purposeful, directed progress toward a goal — development with intent.

From the Greek *telos* (end, purpose) and the tradition of cybernetics and control systems theory. The word captures what software development should be but rarely is: deliberate, directed, and coherent from first spec to final ship.

---

## The Problem

Autonomous coding agents are real and they work. But they work the way an eager junior developer works without a senior on the team — fast, capable, and prone to drift. Left unsupervised, they wander from the original intent, make locally reasonable decisions that globally contradict the architecture, and eventually produce something that passes tests but misses the point.

The missing piece isn't better agents. It's the **control system** around the agents.

Human developers solve this with code review, architecture review, design docs, and accumulated team knowledge. These are manual, expensive, and don't scale to the speed at which autonomous development now operates.

Telesis is the control system. The feedback loop. The thing that keeps autonomous development on the rails.

---

## The Vision

Telesis is a **development intelligence platform** — a swarm of specialized agents that collectively hold the design intent, track progress, detect drift, and steer the autonomous development process toward the goal.

It is not an IDE. It is not a code editor. It is not a one-shot reviewer.

It is the **operating layer** between the human who defines what to build and the agents who build it. It has memory. It has judgment. It maintains accountability across the full lifecycle of a project.

### What Telesis knows:
- **Why** something is being built (requirements, intent)
- **What** is being built (spec, architecture decisions)
- **How** it should be built (constraints, patterns, standards)
- **Where** the project is (milestones, progress, current state)
- **Whether** it's on track (drift detection, spec alignment)

### What Telesis does:
- Captures and maintains the project spec as a living document
- Records architectural decisions and their rationale (ARDs)
- Tracks milestones and validates progress against acceptance criteria
- Detects drift between implementation and intent
- Orchestrates a swarm of specialized agents across the development lifecycle
- Maintains a provenance trail — why decisions were made, what was tried and rejected
- Keeps documentation current as a byproduct of the process, not an afterthought

### The feedback loop:
```
Define intent → Plan → Implement → Validate → Detect drift → Repair → Repeat
```

At each stage, Telesis holds the context that keeps the loop coherent. When something drifts, it doesn't just flag it — it knows *why* it's wrong relative to the original intent.

---

## What Makes It Different

**Current tools give you agents that execute.** Telesis gives you a system that governs.

The difference:
- A code reviewer catches bugs. Telesis catches *drift from intent*.
- A CI/CD pipeline validates builds. Telesis validates *alignment with the design*.
- A project management tool tracks tasks. Telesis tracks *progress toward a coherent whole*.

Telesis is not smarter agents. It is the **structure that makes agents trustworthy** at scale and over time.

---

## The Swarm Model

Telesis orchestrates a panel of specialized agents, each focused on a distinct concern:

- **The Architect** — guards the high-level design; flags decisions that violate structural intent
- **The Reviewer** — examines code for quality, correctness, and alignment (this is bop's domain)
- **The Spec Keeper** — maintains the living specification; detects when implementation diverges from requirements
- **The Milestone Tracker** — validates progress against acceptance criteria; controls what can proceed
- **The Chronicler** — maintains the provenance trail; records decisions, rationale, and rejected paths
- **The Test Sentinel** — ensures the validation layer stays meaningful; watches for test drift

No single agent sees everything. Together, they see what any human team would — and do it at the speed autonomous development demands.

---

## Relationship to Bop

[Bop](https://github.com/delightfulhammers/bop) is Telesis's first agent — the Reviewer. It already exists, works, and has real users.

Bop demonstrated the panel-of-personas model that Telesis generalizes. The lesson bop taught: a multi-perspective review is structurally better than a single-perspective review, every time.

Telesis is what bop grows into. Bop becomes one specialized agent in the swarm — the code review expert — while Telesis provides the coordination layer, the memory, and the broader lifecycle coverage that bop alone can't provide.

Bop users will find Telesis familiar. Telesis users will have bop's capabilities built in.

---

## Design Principles

**1. Opinionated defaults, configurable everything.**
The happy path works before you configure anything. The first `telesis init` should be useful in under five minutes.

**2. The spec is the source of truth.**
Every agent decision traces back to the spec. Drift is defined as deviation from it. If the spec is wrong, you update the spec — you don't quietly let the implementation diverge.

**3. Human-in-the-loop at the right moments.**
Telesis operates autonomously within milestones. It pauses for human judgment at milestone gates, significant architectural decisions, and when it detects irreconcilable conflicts between intent and implementation.

**4. Memory is a first-class feature.**
Context doesn't reset between sessions, PRs, or milestones. Telesis accumulates knowledge about a project over its lifetime and uses it.

**5. Telesis is the bridge between the inner and outer loop.**
Local development (inner loop) needs low friction and fast feedback. CI/CD (outer loop) can afford more rigor. Most tools live in one loop or the other. Telesis connects them — the shared context, memory, and control system that keeps both loops coherent with each other and with the original intent. Like cruise control: it doesn't drive the car, but it maintains the speed between wherever you set it and wherever the road wants to take you.

**6. Documentation is a byproduct, not a task.**
The provenance trail, the decision log, the living spec — these emerge from the process. You don't write documentation after the fact; Telesis maintains it as you go.

---

## The MVP

The shortest path to something useful: **the project context layer**.

A CLI tool that:
- Initializes a structured project context (spec, architecture, milestones, decision log)
- Maintains those documents as living artifacts throughout development
- Makes them available to Claude Code as persistent, injected context
- Validates milestone completion against defined acceptance criteria

No swarm yet. No orchestration. Just the memory and intent layer — the fixed point that everything else will orbit.

This is useful immediately. It solves a real problem (context drift in autonomous development). And it can be built in a focused sprint.

Once this exists, Telesis can be used to build the rest of Telesis.

---

## The Insight Gap

Development sessions produce insights that don't fit neatly into existing categories. An observation like "the `.gitignore` pattern `telesis` matches `cmd/telesis/` — use `/telesis` for root-only" isn't an architectural decision (too small for an ADR), isn't a requirement (doesn't belong in the PRD), and isn't a milestone item. But it's exactly the kind of knowledge that prevents future mistakes.

Today, these insights live in three places — the conversation (ephemeral), the developer's memory (unreliable), or nowhere. None of those are the *project's* memory.

Telesis's principle #4 says memory is first-class. But the MVP's memory mechanisms (ADRs, generated CLAUDE.md, doc updates) are all **heavyweight or structured**. What's missing is a lightweight capture path for **development observations** — things learned during implementation that should inform future sessions.

This is the gap between "documentation as a byproduct" (principle #6) and the reality that some byproducts need an explicit collection mechanism. The Chronicler agent in the swarm model is the long-term answer, but a simpler version — perhaps `telesis note <text>` or automatic extraction from session transcripts — could close this gap much sooner.

---

## What Success Looks Like

A developer starts a new project. They run `telesis init`, answer a few questions about what they're building and why, and Telesis creates the project context. From that point forward:

- Claude Code always has the spec in context
- Every architectural decision gets recorded with its rationale
- Every milestone has acceptance criteria that Telesis validates
- Drift gets caught before it compounds
- Documentation stays current without anyone writing it

The developer moves faster. The code stays coherent. The intent survives the implementation.

That's Telesis.
