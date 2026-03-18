# Telesis Notes — Living Context Management

You are managing development notes that become part of the project's LLM context.

## What Notes Are

Notes are **living instructions injected into CLAUDE.md**. They shape how coding agents behave in every future session. A note is NOT a sticky note — it's a persistent instruction.

## When to Use Notes vs Journal vs ADR

| Mechanism | Purpose | Persistence | Example |
|-----------|---------|-------------|---------|
| **Note** | Living instructions for agents | In CLAUDE.md context, every session | "SSH remote required for workflow scope" |
| **Journal** | Reasoning trail — WHY decisions were made | Permanent record, not in LLM context | "We explored 3 caching strategies and chose Redis because..." |
| **ADR** | Formal architectural decision | Immutable once accepted, in docs/adr/ | "Decision: Use PostgreSQL for persistence" |

**Rule of thumb:**
- "Agents should know this" → **note**
- "We should remember why we chose this" → **journal**
- "This is a significant technical decision" → **ADR**

## Commands

### Add a note
```bash
telesis note add -t <tag> "<text>"
telesis note add -t rules "Always use named exports, never default exports"
telesis note add -t pitfalls -t config "The .gitignore must anchor /telesis to avoid matching src/ paths"
```

### List notes
```bash
telesis note list                  # All notes
telesis note list -t rules         # Filtered by tag
telesis note list --json           # Machine-readable
```

### MCP tools
```
telesis_note_add(text, tags)       # Add via MCP
telesis_note_list(tag?)            # List via MCP
```

## Tag Conventions

Tags become section headings in the generated CLAUDE.md:
- `rules` → operational rules and constraints
- `pitfalls` → known gotchas and things to avoid
- `config` → configuration notes
- `architecture` → structural decisions and patterns
- `git` → git workflow specifics

**Use one primary tag per note.** Notes render under their first tag only (primary tag model). Additional tags are metadata, not additional sections.

## After Changing Notes

Always regenerate CLAUDE.md:
```bash
telesis context
```

This rebuilds CLAUDE.md with the updated notes section.
