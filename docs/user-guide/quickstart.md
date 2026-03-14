---
title: Quick Start
description: Initialize your first Telesis project in five minutes
weight: 20
---

# Quick Start

This guide walks you through initializing Telesis on an existing project. By the end, you'll have a living spec, a project roadmap, and a context file that keeps AI assistants aligned with your intent.

## Step 1: Navigate to Your Project

Telesis operates on git repositories. Navigate to the root of your project:

```bash
cd /path/to/your/project
```

## Step 2: Initialize

Run the interactive initialization:

```bash
telesis init
```

Telesis starts an AI-powered interview. It asks about your project — what you're building, why, for whom, what technology you're using, and what constraints matter. The interview is conversational; answer naturally. Telesis uses your responses to generate a tailored set of project documents.

A typical interview takes 5–10 turns. Telesis knows when it has enough context and will wrap up on its own. If you need to stop early, press `Ctrl+C` — your progress is saved and you can resume later by running `telesis init` again.

When the interview completes, Telesis generates four documents:

- **`docs/VISION.md`** — The foundational "what and why." Your project's purpose, design principles, and the mental model behind it.
- **`docs/PRD.md`** — Product requirements, user journeys, implicit requirements, and command documentation (for CLI projects).
- **`docs/ARCHITECTURE.md`** — System design, repository structure, data flows, and key dependencies.
- **`docs/MILESTONES.md`** — A development roadmap with explicit acceptance criteria for each milestone.

It also creates:

- **`.telesis/config.yml`** — Project metadata and configuration.
- **`CLAUDE.md`** — A generated context file that gives AI assistants (Claude Code, Cursor, etc.) deep awareness of your project's intent, conventions, and current state.

## Step 3: Review the Output

Open the generated documents and read through them. The quality depends on how much context you provided during the interview. If something is missing or wrong, edit the documents directly — they're yours. Telesis treats these files as the source of truth, so corrections here propagate to all downstream decisions.

## Step 4: Check Project Status

```bash
telesis status
```

This prints a summary: project name, active milestone, document counts, and how many tokens you've used so far.

## Step 5: Start Using Telesis

From here, the tools you reach for depend on your workflow:

**Inner loop (fast, local feedback):**

```bash
telesis review          # Review staged changes
telesis drift           # Check for spec drift
```

**Planning loop (task decomposition):**

```bash
telesis intake github   # Import issues as work items
telesis plan create <id> # Decompose a work item into tasks
```

**Outer loop (full orchestration):**

```bash
telesis run <id>        # Plan → execute → validate → commit → push
```

Each of these is covered in detail in the rest of this guide. For the core mental model behind how Telesis works, read [Core Concepts]({{< relref "concepts" >}}) next.

## What Just Happened

When you ran `telesis init`, Telesis:

1. Started an interactive interview using Claude, saving state after each turn to `.telesis/interview-state.json`.
2. Used your responses to generate four Mustache-templated documents.
3. Created a `.telesis/` directory with configuration, telemetry logging, and pricing data.
4. Generated `CLAUDE.md` by reading all project documents and assembling a comprehensive context injection file.
5. Logged every model call to `.telesis/telemetry.jsonl` — token counts, duration, model used — so you always know what you're spending.

Nothing was pushed. Nothing left your machine except the API calls to Anthropic. You're in control.
