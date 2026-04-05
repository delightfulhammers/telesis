# TDD-026 — TUI Foundation

**Status:** Accepted
**Date:** 2026-04-05
**Author:** Delightful Hammers
**Related:** v0.35.0 milestone, #117

---

## Overview

The current `telesis daemon tui` is a read-only event stream — colored log lines printed
to stdout. The goal is a proper interactive terminal UI that can drive the full Telesis
workflow: status monitoring, event filtering, and eventually intake/dispatch/review/pipeline
controls.

This TDD establishes the foundation: a zero-dependency TUI framework built on raw ANSI
escape codes, a view system with keyboard navigation, and two initial views (dashboard
and event stream). The interactive workflow views (intake, dispatch, review, pipeline)
are deferred to v0.36.0.

### What this TDD addresses

- Terminal rendering engine: screen buffer, differential updates, ANSI escape codes
- Input handling: raw mode stdin, key parsing (arrows, enter, tab, vim keys, ctrl sequences)
- View system: switchable views, shared status bar, keybinding hints
- Dashboard view: project status, active milestone, orchestrator state, session summary
- Event stream view: scrollable, filterable upgrade of the current TUI
- Daemon client integration: connect, subscribe, render events in real-time
- `telesis tui` command (top-level, not under `daemon`)

### What this TDD does not address (scope boundary)

- Interactive workflow views (intake, dispatch, review, pipeline) — v0.36.0
- Mouse support
- Terminal resize handling (beyond basic reflow)
- Custom themes or color configuration
- Persistent TUI state across restarts

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  telesis tui                                           │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Screen                                          │  │
│  │  - Raw mode stdin (key events)                   │  │
│  │  - Buffered stdout (differential writes)         │  │
│  │  - Terminal size detection                       │  │
│  └──────────┬───────────────────────────────────────┘  │
│             │                                          │
│  ┌──────────▼───────────────────────────────────────┐  │
│  │  App                                             │  │
│  │  - View router (dashboard, events, ...)          │  │
│  │  - Global key bindings (q, tab, 1/2/3)          │  │
│  │  - Status bar (bottom)                           │  │
│  │  - Header bar (top)                              │  │
│  └──────────┬───────────────────────────────────────┘  │
│             │                                          │
│  ┌──────────▼──────┐  ┌────────────────────────────┐   │
│  │  Dashboard View │  │  Events View               │   │
│  │  - Status       │  │  - Scrollable event log    │   │
│  │  - Milestone    │  │  - Type filter             │   │
│  │  - Sessions     │  │  - Color-coded (existing)  │   │
│  └─────────────────┘  └────────────────────────────┘   │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Daemon Client (existing)                        │  │
│  │  - Unix socket connection                        │  │
│  │  - Event subscription                            │  │
│  │  - Status queries                                │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## Terminal Rendering

### Screen (`src/tui/screen.ts`)

Low-level terminal I/O:

```typescript
interface Screen {
  readonly rows: number;
  readonly cols: number;
  readonly enterRawMode: () => void;
  readonly exitRawMode: () => void;
  readonly onKey: (handler: (key: KeyEvent) => void) => void;
  readonly clear: () => void;
  readonly moveTo: (row: number, col: number) => void;
  readonly write: (text: string) => void;
  readonly writeLine: (row: number, text: string) => void;
  readonly flush: () => void;
  readonly destroy: () => void;
}
```

Uses `process.stdin.setRawMode(true)` for key capture and `process.stdout.write` with
ANSI escape sequences for rendering. No intermediate buffer — writes go directly to stdout
with cursor positioning.

### Key Events (`src/tui/keys.ts`)

Parse raw stdin bytes into structured key events:

```typescript
interface KeyEvent {
  readonly name: string;      // "a", "enter", "up", "tab", "q", etc.
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly raw: Buffer;
}
```

Handles: printable characters, arrow keys, enter, escape, tab, backspace, ctrl+c/q/l.

---

## View System

### View interface (`src/tui/view.ts`)

```typescript
interface View {
  readonly name: string;
  readonly render: (screen: Screen) => void;
  readonly onKey: (key: KeyEvent) => boolean;  // true = handled
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly onResize?: () => void;
}
```

### App (`src/tui/app.ts`)

Manages view lifecycle:

```typescript
interface App {
  readonly start: () => Promise<void>;
  readonly stop: () => void;
}
```

- Connects to daemon, subscribes to events
- Routes key events: global bindings first, then active view
- Renders: header bar (top), view content (middle), status bar (bottom)
- Re-renders on: key input, daemon event, view switch

### Global key bindings

| Key | Action |
|---|---|
| `q` / `Ctrl+C` | Quit |
| `1` | Switch to Dashboard view |
| `2` | Switch to Events view |
| `Tab` | Cycle views |
| `Ctrl+L` | Force redraw |

---

## Views

### Dashboard View

Shows project state at a glance:

```
┌─ Telesis ── Dashboard ─────────────────────────────────┐
│                                                        │
│  Project: My Project                                   │
│  Status: active    Version: 0.34.0                     │
│  Milestone: v0.35.0 — TUI Foundation (Active)          │
│                                                        │
│  ── Orchestrator ──────────────────────────             │
│  State: idle       Decisions: 0 pending                │
│                                                        │
│  ── Sessions ──────────────────────────────             │
│  Active: 0    Completed: 3    Failed: 0                │
│                                                        │
│  ── Recent Events ─────────────────────────             │
│  [12:34:56] daemon:heartbeat                           │
│  [12:34:51] fs:change src/tui/app.ts                   │
│  [12:34:48] dispatch:session:completed task-1          │
│                                                        │
│──────────────────────────────────────────────────────── │
│  [1] Dashboard  [2] Events  [q] Quit                   │
└────────────────────────────────────────────────────────┘
```

Data sources:
- `getStatus(rootDir)` for project metadata
- Daemon `status` command for session/event counts
- Last N events from the event stream

### Events View

Scrollable, filterable event log (upgrade of current `daemon tui`):

```
┌─ Telesis ── Events (all) ──────────────────────────────┐
│                                                        │
│  [12:34:56.123]  daemon:heartbeat                      │
│  [12:34:51.456]  fs:change        src/tui/app.ts       │
│  [12:34:48.789]  dispatch:completed task-1             │
│  [12:34:45.012]  pipeline:stage   quality_check        │
│  [12:34:42.345]  review:finding   [high] XSS vuln      │
│  [12:34:39.678]  git:commit       feat: add TUI        │
│  ...                                                   │
│                                                        │
│──────────────────────────────────────────────────────── │
│  [↑↓] Scroll  [f] Filter  [1] Dashboard  [q] Quit     │
└────────────────────────────────────────────────────────┘
```

Features:
- Scrollable with arrow keys, page up/down, home/end
- Auto-scroll to bottom on new events (unless manually scrolled up)
- Type filter: press `f` to cycle through event categories (all, daemon, fs, dispatch, etc.)
- Uses existing color scheme from `src/daemon/tui.ts`

---

## File Organization

```
src/tui/
  screen.ts           — terminal I/O (raw mode, ANSI, cursor)
  screen.test.ts
  keys.ts             — key event parsing
  keys.test.ts
  view.ts             — View interface
  app.ts              — view router, daemon integration, render loop
  app.test.ts
  colors.ts           — ANSI color constants and helpers
  views/
    dashboard.ts      — dashboard view
    dashboard.test.ts
    events.ts         — event stream view
    events.test.ts

src/cli/tui.ts        — `telesis tui` command (NEW)
```

---

## CLI Command

```
telesis tui
```

Top-level command (not nested under `daemon`). Connects to a running daemon, opens the
interactive TUI. If daemon is not running, prints an error suggesting `telesis daemon start`.

---

## Decisions

1. **Raw ANSI, no framework.** Zero dependency risk with `bun build --compile`. The rendering
   needs are simple enough that a thin abstraction (screen, keys, views) is sufficient.
   Total framework code is ~400 lines.

2. **Top-level `telesis tui` command.** The TUI is important enough to be top-level, not
   buried under `telesis daemon tui`. The old `daemon tui` command stays as the raw event
   stream for scripting/debugging.

3. **Views, not components.** Each view is a full-screen render function, not a composable
   component tree. This is simpler than React-style composition and matches the terminal
   constraint of a single active view at a time.

4. **Daemon-dependent.** The TUI requires a running daemon. It's a client, not a standalone
   tool. This keeps the TUI stateless — all state lives in the daemon and `.telesis/`.

5. **Foundation first.** Dashboard and events views only. Interactive workflow (intake,
   dispatch, review) is a separate milestone that builds on this foundation.

---

## Testing Strategy

- `src/tui/keys.test.ts`: key parsing from raw bytes (arrow keys, ctrl, printable chars)
- `src/tui/screen.test.ts`: ANSI escape code generation (cursor movement, colors, clear)
- `src/tui/views/dashboard.test.ts`: render output given mock status data
- `src/tui/views/events.test.ts`: scroll state, filtering, event formatting
- App integration: mock daemon client, verify view switching and event routing
- No live terminal tests — all tests verify string output, not actual terminal rendering
