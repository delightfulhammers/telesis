---
title: Development Notes & Journal
description: Lightweight memory tools for capturing observations and design thinking
weight: 100
---

# Development Notes & Journal

Telesis provides two lightweight tools for accumulating project memory: notes for quick observations and the journal for longer-form design thinking.

## Development Notes

Notes are short, tagged observations. They're meant to be fast — capture a thought, tag it, move on.

### Adding a Note

```bash
telesis note add "Found that the auth middleware silently swallows 403s" -t bug -t auth
```

Tags are optional and repeatable. Use them for filtering later.

Read from stdin (useful for piping):

```bash
echo "Config parser doesn't handle empty arrays" | telesis note add - -t bug -t config
```

### Listing Notes

```bash
telesis note list
```

Notes are displayed newest first. Filter by tag:

```bash
telesis note list --tag bug
```

Machine-readable output:

```bash
telesis note list --json
```

### Storage

Notes are appended to `.telesis/notes.jsonl` — one JSON object per line with an ID, ISO timestamp, text, and tags. The file is append-only; notes are never modified or deleted.

### When to Use Notes

Notes are ideal for:

- Quick observations during development ("this function is O(n²) and will need attention")
- Flagging things for later ("this API doesn't handle pagination yet")
- Capturing context that doesn't belong in a commit message
- Noting things that are out of scope for the current milestone but should be remembered

They're not meant for extensive analysis — that's what the journal is for.

## Design Journal

The journal is for longer-form entries — design thinking, architectural analysis, decision rationale, ecosystem research.

### Adding a Journal Entry

```bash
telesis journal add "Orchestrator Shape Analysis" "Evaluated three approaches to the pipeline orchestrator: state machine, event-driven, and sequential. The state machine approach provides the best error recovery semantics but adds complexity. Going with sequential + explicit stage transitions as a middle ground."
```

The first argument is the title, the second is the body.

### Listing Entries

```bash
telesis journal list
telesis journal list --json
```

Entries are displayed reverse chronological (newest first).

### Viewing an Entry

```bash
telesis journal show "orchestrator"     # Search by title substring
telesis journal show 2026-03-12          # Search by date
telesis journal show <id>                # Search by ID
```

### Storage

Journal entries are appended to `.telesis/journal.jsonl` with an ID, date, title, and body. Like notes, the file is append-only.

### When to Use the Journal

The journal is ideal for:

- Recording design decisions before they become ADRs
- Analyzing trade-offs between approaches
- Documenting ecosystem research or competitive analysis
- Writing down the "why" behind non-obvious choices
- Post-milestone retrospectives

The key difference from ADRs: journal entries are informal and personal. ADRs are formal and project-facing. Use the journal to think through a decision; use an ADR to record the decision once it's made.

## Memory in Context Generation

Both notes and journal entries are included in the generated `CLAUDE.md` context file. Recent notes appear in the "Development Notes" section (grouped by tag), and recent journal entries appear in the "Recent Journal Entries" section. This means your observations and thinking are automatically available to AI assistants working on your project.
