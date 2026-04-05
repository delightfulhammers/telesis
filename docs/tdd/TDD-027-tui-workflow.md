# TDD-027 — TUI Workflow Views

**Status:** Accepted
**Date:** 2026-04-05
**Author:** Delightful Hammers
**Related:** v0.36.0 milestone, #118, #119, TDD-026

---

## Overview

TDD-026 established the TUI foundation — screen, keys, views, app shell. This TDD adds
the interactive workflow views that make the TUI useful for driving the full Telesis
lifecycle: intake → dispatch → review → pipeline.

### What this TDD addresses

- Reusable selectable list component for keyboard-driven item selection
- Intake view: browse work items, approve/skip, trigger planning
- Pipeline view: active pipeline state, quality gate status
- Dispatch view: monitor sessions
- Review view: review findings summary

### What this TDD does not address (scope boundary)

- In-TUI dispatch execution (dispatch is triggered but runs in background)
- In-TUI code editing or diff display
- Review dismissal workflow (future)
- Git commit message editing in TUI

---

## Selectable List Component

Reusable across views. Handles cursor, scrolling, selection.

```typescript
interface SelectableListConfig<T> {
  readonly items: readonly T[];
  readonly renderItem: (item: T, selected: boolean, width: number) => string;
  readonly onSelect?: (item: T) => void;
}
```

Keys: up/down move cursor, enter selects, home/end jump to bounds.

---

## Views

### Intake View (key: 3)

Lists work items with status indicators. Actions on selected item.

| Key | Action |
|---|---|
| `a` | Approve selected item (dispatch to agent) |
| `s` | Skip selected item |
| `p` | Create plan for selected item |
| `r` | Refresh list from disk |

### Pipeline View (key: 4)

Shows active pipeline state if one exists, otherwise shows recent completions.

### Dispatch View (key: 5)

Lists dispatch sessions with status.

### Review View (key: 6)

Lists review sessions with finding counts.

---

## File Organization

```
src/tui/
  list.ts              — SelectableList component
  list.test.ts
  views/
    intake.ts          — Intake view
    intake.test.ts
    pipeline.ts        — Pipeline view
    pipeline.test.ts
    dispatch.ts        — Dispatch view  
    dispatch.test.ts
    review.ts          — Review view
    review.test.ts
```
