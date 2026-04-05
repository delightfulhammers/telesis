# TDD-024 — Monorepo Support

**Status:** Accepted
**Date:** 2026-04-05
**Author:** Delightful Hammers
**Related:** v0.33.0 milestone, #116

---

## Overview

Telesis assumes the git root (`.git/`) is co-located with the project root (`.telesis/`).
In a monorepo, `.git/` lives at the repository root while `.telesis/` is per-service in
a subdirectory. This causes `installHook` to fail with "Not a git repository" when running
`telesis init` inside a monorepo service directory.

This TDD decouples git root discovery from project root discovery. The project root is
where `.telesis/config.yml` lives. The git root is found by walking upward for `.git/`.
These are independent values that happen to be the same in single-repo projects.

### What this TDD addresses

- `findGitRoot()` utility — walks upward from a directory to find `.git/`
- `installHook` refactored to accept separate `projectRoot` and `gitRoot`
- Hook body uses absolute paths so it works when git root ≠ project root
- Project-scoped hook markers to avoid collision when multiple telesis projects share a git repo
- `findProjectRoot` boundary — stops at `.git/` to avoid finding a parent project's config
- All callers updated (`init`, `hooks install`, scaffold)

### What this TDD does not address (scope boundary)

- Multi-project orchestration (running preflight for all telesis projects in a monorepo)
- Shared documentation across services (e.g., monorepo-wide ARCHITECTURE.md)
- Inter-project dependencies in TDD/ADR references
- Git worktree-aware hook paths

---

## Architecture

```
monorepo/                       ← git root (.git/ lives here)
├── .git/
│   └── hooks/
│       └── pre-commit          ← shared hook, telesis section uses absolute paths
├── services/
│   ├── auth-service/           ← project root (.telesis/ lives here)
│   │   ├── .telesis/
│   │   │   └── config.yml
│   │   ├── docs/
│   │   └── CLAUDE.md
│   └── billing-service/        ← another project root
│       ├── .telesis/
│       │   └── config.yml
│       └── docs/
```

### Root resolution

```
findProjectRoot(cwd)  →  walks up for .telesis/config.yml, stops at filesystem root
findGitRoot(cwd)      →  walks up for .git/ (file or directory), stops at filesystem root
```

These are independent. `findGitRoot` is used only for hook installation and git operations.
`findProjectRoot` is used for all business logic (status, drift, review, etc.).

---

## Types

### New utility

```typescript
/** Walks upward from startDir looking for .git (file or directory).
 *  Returns the directory containing .git, or null if not found. */
export const findGitRoot = (startDir: string): string | null;
```

Returns `null` instead of throwing — not every context requires a git repo (e.g., testing).

### Updated hook signature

```typescript
/** Install the telesis pre-commit git hook.
 *  @param projectRoot — where .telesis/ lives
 *  @param gitRoot — where .git/ lives (may be an ancestor of projectRoot) */
export const installHook = (projectRoot: string, gitRoot: string): void;
```

---

## Hook Body Changes

The current hook body uses relative paths:
```bash
MARKER=".telesis/.preflight-ran"
telesis orchestrator preflight 2>&1
```

In a monorepo, the git hook runs with `cwd` = git root, not project root. The hook must
`cd` to the project root before running preflight, and use absolute paths for the marker.

Updated hook body (project root baked in at install time):
```bash
PROJECT_ROOT="/absolute/path/to/services/auth-service"
MARKER="$PROJECT_ROOT/.telesis/.preflight-ran"

# Defer if Claude Code hook already ran preflight recently
if [ -f "$MARKER" ]; then
  ...
fi

# Run preflight from the project root
if command -v telesis &>/dev/null; then
  (cd "$PROJECT_ROOT" && telesis orchestrator preflight 2>&1)
  ...
fi
```

The `PROJECT_ROOT` is written as an absolute path at `installHook` time via string
interpolation into the hook template.

---

## Project Root Boundary

`findProjectRoot` currently walks upward without limit. In a monorepo with multiple
telesis projects, this could find a parent project's `.telesis/config.yml` if invoked
from a nested directory.

No change is made here — the walk-up behavior is correct. If you're in
`monorepo/services/auth-service/src/`, it should find
`monorepo/services/auth-service/.telesis/config.yml`. It won't find a parent because
each service has its own `.telesis/`. If somehow a parent also has `.telesis/`, the
nearest one wins — which is the expected behavior.

---

## Changes

### `src/hooks/git-root.ts` (NEW)

```typescript
export const findGitRoot = (startDir: string): string | null;
```

Walks upward from `startDir` looking for `.git` (supports both directory and file — git
worktrees use a `.git` file pointing to the actual git dir). Returns `null` if not found.

### `src/hooks/install.ts` (MODIFY)

- `installHook(rootDir)` → `installHook(projectRoot, gitRoot)`
- `ensureGitRepo` checks `gitRoot` instead of `projectRoot`
- `hookPath` uses `gitRoot`
- Hook body template uses absolute `PROJECT_ROOT` path
- `uninstallHook` updated similarly
- `isHookInstalled` updated similarly

### `src/cli/init.ts` (MODIFY)

- Import `findGitRoot`
- Resolve `gitRoot` before calling `installHook`
- Pass both to `installProviderAdapter`

### `src/cli/hooks.ts` (MODIFY)

- Import `findGitRoot`
- Resolve `gitRoot` before calling `installHook`/`uninstallHook`

### `src/scaffold/scaffold.ts` (NO CHANGE)

The scaffold's `installProviderAdapter` callback is defined inline in `init.ts`, not in
scaffold.ts. The scaffold itself doesn't call hooks directly.

---

## Decisions

1. **`findGitRoot` returns null, not throws.** Missing git repo is not fatal for most
   telesis operations. Only hook installation requires it. Callers decide whether to
   throw or skip.

2. **Absolute paths in hook body.** The project root is baked into the hook at install
   time. This means moving the project directory requires re-running `telesis hooks install`.
   Acceptable — moving a service directory in a monorepo is a major refactor anyway.

3. **No multi-project hook orchestration.** Each telesis project installs its own section
   in the shared pre-commit hook. If two services are initialized, the hook has two
   telesis sections, each with its own `PROJECT_ROOT`. This is simple but could get
   unwieldy with many services. Acceptable for the initial implementation.

4. **`.git` file support.** Git worktrees use a `.git` file (not directory) containing
   `gitdir: /path/to/real/git/dir`. `findGitRoot` checks `existsSync` which returns
   true for both files and directories. The hook path resolution still uses
   `join(gitRoot, ".git", "hooks")` which works for normal repos. Worktree-specific
   hook paths are out of scope.

---

## Testing Strategy

- `src/hooks/git-root.test.ts`: temp dirs with `.git/` at various levels, no `.git/`, symlinks
- `src/hooks/install.test.ts`: add monorepo tests — `.git/` at parent, hook installed at
  parent's `.git/hooks/`, hook body contains absolute project root path
- Existing hook tests updated for new 2-parameter signature
- `src/cli/init.ts` integration: test that init in a subdirectory of a git repo succeeds
