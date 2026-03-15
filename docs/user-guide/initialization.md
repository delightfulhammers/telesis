---
title: Project Initialization
description: The AI-powered interview and what it produces
weight: 40
---

# Project Initialization

`telesis init` is the entry point. It runs an AI-powered interview to understand your project, then generates a complete set of living documents from your responses.

## Running the Interview

```bash
telesis init
```

Telesis opens a multi-turn conversation with Claude. It asks about your project's purpose, audience, technology, constraints, and goals. Answer naturally — it's a conversation, not a form. The more context you provide, the better the generated documents will be.

A typical interview takes 5–10 turns. Telesis monitors the conversation and wraps up when it has enough information. You can also end the interview early with `Ctrl+C`; your progress is saved automatically.

### Resuming an Interrupted Interview

If you stop mid-interview (intentionally or due to a crash), run `telesis init` again. Telesis detects the saved interview state in `.telesis/interview-state.json` and resumes where you left off. No context is lost.

### What the Interview Asks About

The interview adapts to your answers, but it generally covers:

- **Project identity** — name, owner, primary language, repository URL
- **Purpose** — what the project does and why it exists
- **Users** — who uses it and what their needs are
- **Architecture** — how the system is structured, key components, data flows
- **Constraints** — technology choices, performance requirements, compliance needs
- **Development practices** — testing strategy, deployment model, team conventions
- **Roadmap** — what's been built, what's next, what "done" looks like

## Generated Documents

After the interview, Telesis generates four documents in `docs/`:

### VISION.md

The foundational "what and why." This document captures your project's purpose, design principles, and the mental model behind it. It's the document you'd hand to someone who asks "what are you building and why?"

VISION.md changes rarely. When it does, it signals a fundamental shift in the project's direction.

### PRD.md

Product requirements. This includes user journeys, functional requirements, implicit requirements (things that must be true but are easy to forget), and — for CLI projects — command documentation.

The PRD grows as features are added. It's the reference for "what does this project need to do?"

### ARCHITECTURE.md

System design. This covers the repository structure, key modules, data flows, dependencies, and architectural constraints. It's the reference for "how is this built?"

ARCHITECTURE.md is updated whenever the system structure changes — new modules, new data flows, new dependencies.

### MILESTONES.md

The development roadmap. Each milestone has a clear goal, a status, and explicit acceptance criteria. Milestones are not vague aspirations; they define what "done" looks like for each phase.

## Project Configuration

Telesis also creates `.telesis/config.yml` with your project metadata:

```yaml
project:
  name: "Your Project"
  owner: "Your Name"
  languages:
    - "TypeScript"
  status: "active"
  repo: "github.com/you/your-project"
```

This configuration is extended later as you enable features like custom review personas, dispatch agents, and pipeline behavior. See the [Configuration Reference]({{< relref "configuration" >}}) for all options.

## Context Generation

Finally, Telesis generates `CLAUDE.md` at the project root. This file aggregates context from all project documents into a single file optimized for AI assistant consumption. It's what keeps Claude Code, Cursor, and similar tools aligned with your project's intent. See [Context Generation]({{< relref "context-generation" >}}) for details.

## Post-Initialization

After initialization, your project has:

```
.telesis/
  config.yml
  telemetry.jsonl
  interview-state.json
  pricing.yml
docs/
  VISION.md
  PRD.md
  ARCHITECTURE.md
  MILESTONES.md
CLAUDE.md
```

From here, you might:

- **Edit the generated documents.** They're yours. Fix anything the interview got wrong. Add context it missed. The documents are the source of truth, and Telesis respects your edits.
- **Run `telesis status`** to see a summary of your project state.
- **Run `telesis eval`** to check the quality of the generated documents.
- **Run `telesis review`** to review staged code changes against your new spec.
- **Start a milestone** by writing code and using `telesis drift` to stay aligned.

## Document Evaluation

Telesis can evaluate the quality of your generated documents:

```bash
telesis eval
```

This runs a battery of evaluators that check structural completeness, specificity (are statements concrete or vague?), actionability (can a developer act on this?), coverage (are all expected sections present?), and internal consistency. The output tells you where to focus your editing effort.

For machine-readable output:

```bash
telesis eval --json
```
