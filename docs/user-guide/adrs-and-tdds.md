---
title: ADRs & TDDs
description: Architectural Decision Records and Technical Design Documents
weight: 330
---

# ADRs & TDDs

Telesis provides two formal documentation mechanisms for tracking decisions and designs: Architectural Decision Records (ADRs) and Technical Design Documents (TDDs).

## Architectural Decision Records (ADRs)

ADRs capture significant architectural decisions — the "why" behind structural choices. They answer: "We decided X instead of Y, and here's why."

### Creating an ADR

```bash
telesis adr new typescript-agent-layer
```

This creates `docs/adr/ADR-003-typescript-agent-layer.md` (the number is auto-incremented) from a template. The template includes sections for context, decision, consequences, and alternatives considered.

### ADR Lifecycle

```
Proposed → Accepted → Superseded
```

- **Proposed** — the decision is under discussion
- **Accepted** — the decision has been made and the implementation matches it
- **Superseded** — the decision has been replaced by a newer ADR

### Immutability

ADRs are immutable once Accepted. If you need to revisit a decision, create a new ADR that supersedes the original. The original remains in the record, preserving the historical context of why the initial decision was made and what changed.

### When to Write an ADR

Write an ADR for significant architectural decisions — technology choices, containment patterns, protocol decisions, major structural changes. When in doubt, write one. The cost of an unnecessary ADR is low; the cost of an undocumented decision is high when you're trying to understand why something was built a certain way six months later.

Examples of decisions that warrant an ADR:

- Choosing TypeScript over Go for the CLI
- Deciding to use a Unix socket for daemon IPC instead of HTTP
- Containing all Anthropic SDK imports to a single module
- Choosing append-only JSONL over a database for telemetry

Examples that don't need an ADR:

- Which testing framework to use (mention in conventions)
- Code formatting rules (mention in conventions)
- Variable naming conventions (mention in conventions)

## Technical Design Documents (TDDs)

TDDs describe component-level design — the "how" for a specific subsystem. They're more detailed than ADRs and cover interface boundaries, data flows, error handling, and implementation constraints.

### Creating a TDD

```bash
telesis tdd new event-backbone
```

This creates `docs/tdd/TDD-015-event-backbone.md` (auto-incremented) from a template.

### TDD Lifecycle

```
Draft → Accepted
```

- **Draft** — the design is proposed but not yet implemented
- **Accepted** — the implementation matches the design

TDDs are accepted when the milestone that implements them is completed (`telesis milestone complete` updates TDD statuses automatically).

### When to Write a TDD

Write a TDD when a milestone introduces a new package or subsystem with its own interface boundary, or when there are significant design decisions to document (containment patterns, retry strategies, protocol choices, adapter layering).

Pure workflow milestones — wiring existing pieces together without new interfaces — may skip a TDD.

TDDs should be written before implementation when possible. They serve as a design contract: "this is what we're building and how it should work." When written retroactively (which happens), they still document the rationale and scope boundary — set the status directly to Accepted.

### TDD Discipline and Milestones

The `milestone-tdd-consistency` drift check verifies that milestones referencing TDDs point to TDDs that actually exist with the correct status. The `tdd-coverage` check verifies that milestones introducing new subsystems have corresponding TDDs.

When a milestone is completed, `telesis milestone complete` automatically transitions referenced TDDs from Draft to Accepted.

## Storage

ADRs live in `docs/adr/` and TDDs live in `docs/tdd/`. Both use Markdown with a structured template. The numbering is sequential and auto-managed by Telesis.

Both ADRs and TDDs are included in the generated `CLAUDE.md` context file — recent ADRs appear in the "Recent Decisions" section, and TDDs are listed in the "Key Documents" section. This means AI assistants working on your project have access to your decision history and component designs.
