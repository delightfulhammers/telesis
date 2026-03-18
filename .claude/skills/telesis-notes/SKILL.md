---
name: telesis-notes
description: "Use when capturing operational knowledge, project conventions, or instructions that should persist across Claude Code sessions. Notes become part of CLAUDE.md — they are living LLM context, not scratch. Load this when creating notes, managing tags, or when deciding whether something should be a note, journal entry, or ADR."
---

# Telesis Notes — Living Context Management

## What Notes Are

Notes are **living instructions injected into CLAUDE.md**. They shape how coding agents behave in every future session. A note is NOT a sticky note — it's a persistent instruction.

## When to Use Notes vs Journal vs ADR

| Mechanism | Purpose | Persistence | Example |
|-----------|---------|-------------|---------|
| **Note** | Living instructions for agents | In CLAUDE.md context, every session | "SSH remote required for workflow scope" |
| **Journal** | Reasoning trail — WHY decisions were made | Permanent record, not in LLM context | "We explored 3 caching strategies and chose Redis because..." |
| **ADR** | Formal architectural decision | Immutable once accepted, in docs/adr/ | "Decision: Use PostgreSQL for persistence" |

**Decision tree:**
- "Agents should know this going forward" → **note**
- "We should remember why we chose this" → **journal entry**
- "This is a significant technical decision with alternatives considered" → **ADR**

## Commands

```bash
# Add a note with tags
telesis note add -t <tag> "<text>"
telesis note add -t rules "Always use named exports, never default exports"

# List notes
telesis note list                  # All notes
telesis note list -t rules         # Filtered by tag

# Journal entries (for reasoning, not instructions)
telesis journal add "<title>" "<body>"
telesis journal list
telesis journal show <query>
```

## Tag Conventions

Tags become section headings in CLAUDE.md. Common tags:
- `rules` — operational rules and constraints
- `pitfalls` — known gotchas and things to avoid
- `architecture` — structural decisions and patterns
- `config` — configuration specifics
- `git` — git workflow notes

**Use one primary tag per note.** Notes render under their first tag only (primary tag model).

## After Changing Notes

Always regenerate CLAUDE.md:
```bash
telesis context
```
