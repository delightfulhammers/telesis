# TDD-021 — Unified Init

**Status:** Accepted
**Date:** 2026-03-25
**Author:** Delightful Hammers
**Related:** v0.31.0 milestone, TDD-020 (Provider-Neutral Enforcement)

---

## Overview

`telesis init` currently only handles the greenfield case: AI interview → doc generation →
scaffold. Projects with existing documentation or older telesis installations have no smooth
onboarding path. The `upgrade` command handles scaffold retrofitting but is separate, confusingly
named (similar to `update`), and doesn't handle existing docs.

This TDD evolves `telesis init` into a unified onboarding command that auto-detects the project
state and applies the appropriate mode. The `upgrade` command is removed entirely.

### What this TDD addresses

- Project state detection: greenfield vs. existing docs vs. telesis migration
- Existing doc ingestion (skip interview when docs already exist)
- Scaffold artifact retrofitting (absorbed from `upgrade`)
- Provider detection and adapter installation
- Removal of the `upgrade` command and CLI entry
- `--docs` flag for custom docs directory

### What this TDD does not address (scope boundary)

- Changes to the AI interview engine itself
- Multi-PRD support (future)
- Conversational adoption via MCP (future — CLI-only for v0.31.0)

---

## Architecture

```
telesis init
     │
     ▼
┌──────────────┐
│ detectState  │ → reads filesystem to determine mode
└──────┬───────┘
       │
       ├─ greenfield → runInterview + generateDocs (existing flow)
       ├─ existing   → ingestDocs + createConfig + scaffold
       └─ migration  → classifyArtifacts + apply (from upgrade.ts)
       │
       ▼
┌──────────────┐
│ installAdapt │ → detect provider, install hooks/skills/MCP config
└──────────────┘
```

### Modified files

| File | Change |
|------|---------|
| `src/scaffold/unified-init.ts` | **New** — unified init orchestrator with mode dispatch |
| `src/scaffold/detect.ts` | **New** — project state detection logic |
| `src/scaffold/detect.test.ts` | **New** — tests for state detection |
| `src/scaffold/unified-init.test.ts` | **New** — tests for unified init orchestration |
| `src/scaffold/upgrade.ts` | Reused internally (classifyArtifacts), CLI command removed |
| `src/cli/init.ts` | Updated to dispatch to unified init |
| `src/cli/upgrade.ts` | **Removed** |
| `src/index.ts` | Remove upgrade command registration |

---

## Types

### Project state

```typescript
export type InitMode = "greenfield" | "existing" | "migration";

export interface ProjectState {
  readonly mode: InitMode;
  readonly hasConfig: boolean;        // .telesis/config.yml exists
  readonly existingDocs: readonly string[];  // found doc paths (e.g., "docs/PRD.md")
  readonly missingDocs: readonly string[];   // expected but not found
  readonly hasClaudeDir: boolean;     // .claude/ exists (Claude Code provider)
}
```

### Expected docs

```typescript
const EXPECTED_DOCS = [
  "docs/VISION.md",
  "docs/PRD.md",
  "docs/ARCHITECTURE.md",
  "docs/MILESTONES.md",
] as const;
```

---

## Key Design Decisions

### 1. Detection is pure filesystem inspection, no LLM

`detectState` reads the filesystem and returns a `ProjectState`. No model calls. The logic:
- Has `.telesis/config.yml` → `migration` (already initialized, may need artifact updates)
- Has any of the expected docs but no `.telesis/config.yml` → `existing` (docs present, needs init)
- Neither → `greenfield` (full interview)

### 2. Existing mode skips the interview, extracts config from docs

When docs already exist, there's no need for the AI interview — the information is already
written down. Instead, `init` reads the existing docs and extracts the config (project name,
owner, language, etc.) using the existing `extractConfig` LLM call, passing doc content as
context instead of interview state.

### 3. Migration mode reuses upgrade logic directly

The `classifyArtifacts` function from `upgrade.ts` is reused as-is. Migration mode is
literally what `upgrade` did, just invoked from `init` instead of a separate command.

### 4. Provider detection is simple heuristic

- `.claude/` directory exists → Claude Code user → install skills + Claude Code hooks
- Otherwise → generic → install git hooks + MCP config

This is intentionally simple. More sophisticated detection can be added later.

### 5. `--docs` flag overrides the search directory

By default, `init` looks for docs in `docs/`. The `--docs` flag lets the user point at a
different directory (e.g., `telesis init --docs documentation/`).

### 6. Idempotent by design

Running `init` on an already-initialized project detects `migration` mode and only adds
missing artifacts. Running it again after everything is present is a no-op. The current
"already initialized" error is replaced with mode detection.

---

## Test Strategy

Tests written FIRST.

- **State detection tests:** temp directories with various combinations of `.telesis/config.yml`,
  `docs/PRD.md`, `.claude/`, etc. Verify correct mode and doc inventory for each scenario.
- **Existing mode tests:** temp dir with docs, verify config is created, scaffold artifacts
  installed, gaps reported. No interview should run.
- **Migration mode tests:** temp dir with `.telesis/config.yml`, verify missing artifacts
  retrofitted (reuses upgrade test patterns).
- **Greenfield mode tests:** verify interview is invoked (mock deps, same as current init tests).
- **Provider detection tests:** `.claude/` present → Claude Code adapter; absent → generic.
- **`--docs` flag tests:** custom docs path is respected.
- **Idempotency tests:** run init twice, verify second run is a no-op.
- **Upgrade command removal:** verify `telesis upgrade` is not registered.
