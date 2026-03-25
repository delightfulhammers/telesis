# TDD-020 — Provider-Neutral Enforcement

**Status:** Accepted
**Date:** 2026-03-25
**Author:** Delightful Hammers
**Related:** v0.30.0 milestone, TDD-016 (Orchestrator), TDD-018 (Multi-Session)

---

## Overview

Telesis currently depends on Claude Code-specific mechanisms for enforcement (PreToolUse hooks)
and contextual guidance (.claude/skills/). This works for Claude Code users but provides no
guardrails for developers using Codex, Gemini, Cursor, or any other MCP-compatible agent.

This TDD addresses the provider-neutral enforcement layer: git hooks for preflight gating and
MCP resources for contextual guidance. These mechanisms work with any agent that respects git
hooks and speaks MCP.

### What this TDD addresses

- `telesis hooks install` / `uninstall` CLI commands for git hook management
- Git pre-commit hook that calls `telesis orchestrator preflight`
- Coexistence with Claude Code hooks (dedup via marker file)
- Contextual guidance served as MCP resources (skills content as resources)
- MCP logging messages for process nudges on orchestrator state changes

### What this TDD does not address (scope boundary)

- `telesis adopt` (v0.31.0)
- Provider detection and adapter installation (v0.31.0)
- Pre-push hooks (preflight is sufficient at pre-commit; push gating is future)
- Git hook templating or customization

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Any MCP Client                     │
│             (Claude Code, Codex, etc.)                │
├──────────────────────────────────────────────────────┤
│  MCP Tools (27)           │  MCP Resources            │
│  orchestrator, review,    │  docs (existing)           │
│  drift, intake, etc.      │  guidance (NEW: skills     │
│                           │    content as resources)   │
├──────────────────────────────────────────────────────┤
│                Telesis MCP Server                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                    Git Hooks                          │
│  .git/hooks/pre-commit → telesis orchestrator        │
│                          preflight                    │
│  (provider-neutral — works with any agent)            │
│  (defers if Claude Code hook already ran)             │
└──────────────────────────────────────────────────────┘
```

### New files

| File | Purpose |
|------|---------|
| `src/hooks/install.ts` | Git hook installation/uninstallation logic |
| `src/hooks/install.test.ts` | Unit tests for hook management |
| `src/hooks/templates.ts` | Git hook script templates |
| `src/cli/hooks.ts` | `telesis hooks install` / `uninstall` commands |
| `src/mcp/resources/guidance.ts` | Contextual guidance as MCP resources |
| `src/mcp/resources/guidance.test.ts` | Unit tests for guidance resources |

### Modified files

| File | Change |
|------|--------|
| `src/mcp/resources/index.ts` | Register guidance resources |
| `src/cli/index.ts` | Register hooks command |

---

## Key Design Decisions

### 1. Git hooks use a marker file for Claude Code dedup

The Claude Code PreToolUse hook runs `telesis orchestrator preflight` before git commit. If
the git pre-commit hook also runs preflight, the check runs twice. To avoid this:

- The Claude Code hook writes a marker file (`.telesis/.preflight-ran`) after a successful
  preflight check.
- The git pre-commit hook checks for the marker file. If it exists and was written within
  the last 60 seconds, the hook defers (exits 0).
- The marker file is cleaned up by the git hook after checking.

This is simpler and more robust than environment variable passing (which doesn't survive
across the process boundary between Claude Code's hook runner and git's hook runner).

### 2. Git hooks are installed to .git/hooks/, not .husky/ or similar

Telesis installs directly to `.git/hooks/pre-commit`. This is the most portable approach —
no dependency on husky, lint-staged, or other hook managers. If the project already has a
pre-commit hook, `telesis hooks install` appends to it (with a clearly marked section) rather
than overwriting. `uninstall` removes only the telesis section.

### 3. Guidance resources mirror skill content, not skill metadata

The MCP resources serve the *content* of each skill (the markdown body) as a readable
resource. The resource URI follows the pattern `telesis://guidance/{skill-name}`. The
resource description matches the skill's frontmatter `description` field. This way, any
MCP client gets the same contextual guidance that Claude Code gets via skills.

### 4. Skills are read from disk at request time, not embedded

Unlike the `telesis upgrade` command (which embeds skills at build time for the compiled
binary), MCP resources read skill files from `.claude/skills/` at request time. This means
the MCP server always serves the current version of the skills, even if they've been
customized by the user.

### 5. Process nudges use existing orchestrator state change events

The MCP server already has `sendLoggingMessage` support (added in v0.26.0). The daemon
already emits `orchestrator:state_changed` and `orchestrator:decision_created` events. The
MCP server subscribes to these events and pushes logging messages. No new event types needed.

---

## Git Hook Template

```bash
#!/bin/bash
# --- telesis pre-commit hook ---
# Installed by: telesis hooks install
# Runs preflight checks before allowing commits.
# Defers if Claude Code hook already ran preflight (marker file).

MARKER=".telesis/.preflight-ran"

# Defer if Claude Code hook already ran preflight recently (within 60s)
if [ -f "$MARKER" ]; then
  MARKER_AGE=$(( $(date +%s) - $(stat -f %m "$MARKER" 2>/dev/null || stat -c %Y "$MARKER" 2>/dev/null || echo 0) ))
  if [ "$MARKER_AGE" -lt 60 ]; then
    rm -f "$MARKER"
    exit 0
  fi
  rm -f "$MARKER"
fi

# Run preflight — only if telesis is on PATH
if command -v telesis &>/dev/null; then
  telesis orchestrator preflight 2>&1
  RESULT=$?
  if [ $RESULT -ne 0 ]; then
    echo "Telesis preflight checks failed. Commit blocked." >&2
    echo "Run 'telesis orchestrator preflight' to see details." >&2
    exit 1
  fi
fi
# --- end telesis pre-commit hook ---
```

---

## Guidance Resources

Each skill in `.claude/skills/*/SKILL.md` becomes an MCP resource:

| Resource URI | Source |
|-------------|--------|
| `telesis://guidance/telesis-pipeline` | `.claude/skills/telesis-pipeline/SKILL.md` |
| `telesis://guidance/telesis-review` | `.claude/skills/telesis-review/SKILL.md` |
| `telesis://guidance/telesis-milestone` | `.claude/skills/telesis-milestone/SKILL.md` |
| etc. | etc. |

Resources are registered dynamically by scanning `.claude/skills/` at MCP server startup.
Each resource's description is extracted from the skill's YAML frontmatter.

---

## Test Strategy

Tests are written FIRST, before implementation.

- **Hook installation tests:** temp git repo, install hook, verify `.git/hooks/pre-commit`
  exists and is executable, contains the telesis section. Install on existing hook — verify
  original content preserved plus telesis section appended.
- **Hook uninstallation tests:** install then uninstall — verify telesis section removed,
  original content preserved. Uninstall when not installed — no-op.
- **Hook dedup tests:** write marker file, run hook script in subprocess — verify it exits 0
  without calling preflight. Stale marker (>60s) — verify hook runs preflight.
- **Guidance resource tests:** create temp skills directory, register resources, verify
  resource URIs match skill names, content matches skill body, description matches
  frontmatter.
- **Missing skills directory:** no `.claude/skills/` — zero guidance resources registered
  (not an error).
- **All tests use temp directories with real git repos.** No live daemon, no live MCP server.
