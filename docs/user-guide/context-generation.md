---
title: Context Generation
description: How CLAUDE.md works and why it matters
weight: 340
---

# Context Generation

`CLAUDE.md` is the bridge between your project documentation and AI assistants. It's a generated file that aggregates context from all project documents into a single, comprehensive context injection file.

## What CLAUDE.md Contains

The generated file includes:

- **Project metadata** — name, owner, status, language, repository
- **About section** — extracted from VISION.md, explaining what the project is and why it exists
- **Quick start navigation** — pointers to key documents
- **Active milestone** — current milestone with acceptance criteria and build sequence
- **Recent decisions** — the 5 most recent ADRs with titles and status
- **Key documents** — index of all project documentation
- **Design principles** — extracted from VISION.md
- **Custom context** — verbatim content from `docs/context/*.md`
- **Development notes** — recent notes grouped by tag
- **Recent journal entries** — latest design journal entries

## Regenerating CLAUDE.md

```bash
telesis context
```

This command is idempotent — safe to run at any time. It reads all project documents and regenerates CLAUDE.md from scratch.

Run it after any documentation change to keep the context file current. The `claude-md-freshness` drift check will flag you if CLAUDE.md is stale relative to the most recently modified document.

## Why It Matters

AI coding assistants (Claude Code, Cursor, Windsurf, etc.) use CLAUDE.md as their primary context about your project. Without it, an assistant starts every session with zero knowledge of your project's intent, conventions, and current state. With it, the assistant has deep awareness from the first interaction.

This is the mechanism by which Telesis keeps AI assistants aligned with your stated intent. When Claude Code opens your repository, it reads CLAUDE.md and immediately knows:

- What you're building and why
- What the current milestone is and what "done" looks like
- What architectural decisions have been made
- What conventions to follow
- What recent development context is relevant

## Custom Context Sections

Files in `docs/context/` are included verbatim in CLAUDE.md. This is where you put project-specific context that doesn't fit the standard document structure.

Common uses:

- **Working conventions** — coding standards, commit message format, PR expectations, testing requirements
- **Team agreements** — how decisions are made, who approves what
- **External relationships** — dependencies on other projects, shared services, upstream/downstream considerations
- **Known issues** — current workarounds, technical debt, things to watch out for

Create a file like `docs/context/working-conventions.md` and it will appear in the next `telesis context` regeneration.

## Don't Edit CLAUDE.md Directly

CLAUDE.md is a generated file. Any direct edits will be overwritten the next time `telesis context` runs. Instead:

- Edit the source documents (`docs/VISION.md`, `docs/PRD.md`, etc.)
- Add custom sections to `docs/context/`
- Run `telesis context` to regenerate

## When to Regenerate

Regenerate after:

- Editing any document in `docs/`
- Completing a milestone (`telesis milestone complete` does this automatically)
- Adding or updating an ADR or TDD
- Adding or modifying files in `docs/context/`
- Adding significant development notes

The post-code-change checklist includes running `telesis context` when docs have changed.

## Generated File Header

CLAUDE.md includes a header noting that it's generated, the generation timestamp, and the project name. This header helps both humans and tools recognize it as a generated artifact.
