---
title: Drift Detection
description: Keeping implementation aligned with intent
weight: 60
---

# Drift Detection

Drift is deviation from your spec. `telesis drift` runs a battery of checks that compare your implementation against your stated intent — your architecture document, your conventions, your milestone definitions — and reports where they've diverged.

This is not linting. A perfectly linted codebase can still be badly drifted. Drift detection answers the question: "Does my code match what I said I'm building?"

## Running Drift Detection

Check everything:

```bash
telesis drift
```

Run specific checks:

```bash
telesis drift --check sdk-import commander-import
```

Machine-readable output:

```bash
telesis drift --json
```

Post results as a PR comment:

```bash
telesis drift --github-pr
```

### Exit Codes

`telesis drift` exits with code 1 if any error-severity finding is detected. This makes it suitable as a CI gate or git hook.

## Available Checks

Telesis ships with a set of built-in drift checks. Each check targets a specific convention or structural requirement.

### Import Discipline Checks

**`sdk-import`** — Verifies that `@anthropic-ai/sdk` is only imported in `src/agent/model/client.ts`. This containment pattern keeps provider coupling localized to a single module.

**`commander-import`** — Verifies that Commander (the CLI framework) is only imported in `src/cli/` files. Business logic packages should know nothing about the CLI framework.

**`acpx-import`** — Verifies that ACP (Agent Client Protocol) imports are contained to the dispatch module.

**`rxjs-import`** — Verifies that RxJS is only imported in the event bus module. RxJS is the sole reactive library and should not leak across the codebase.

### Structural Checks

**`expected-directories`** — Verifies that expected directories exist (e.g., `src/cli/`, `src/config/`, `src/agent/`). Missing directories indicate incomplete scaffolding or accidental deletion.

**`test-colocation`** — Verifies that test files are colocated with their source files (`config.ts` has a `config.test.ts` in the same directory, not in a separate `tests/` tree).

### Registration Checks

**`command-registration`** — Verifies that CLI commands defined in `src/cli/` are registered in the main program. Catches commands that were written but never wired up.

**`cli-version-sync`** — Verifies that the CLI reports the same version as `package.json`.

### Consistency Checks

**`claude-md-freshness`** — Verifies that `CLAUDE.md` was regenerated after the most recent document change. Stale context files defeat the purpose of context injection.

**`stale-references`** — Scans for references to files, modules, or paths that no longer exist. Catches broken links in documentation and code comments.

**`milestone-tdd-consistency`** — Verifies that milestones referencing TDDs point to TDDs that actually exist with the correct status.

**`version-consistency`** — Verifies that version numbers are consistent across `package.json`, milestone definitions, and any other version-bearing files.

**`tdd-coverage`** — Verifies that milestones introducing new subsystems have corresponding TDDs.

### No Process Exit

**`no-process-exit`** — Verifies that `process.exit()` is not called outside of CLI command handlers. Business logic should throw errors; CLI commands catch them and handle exit behavior. This separation keeps business logic testable.

## Interpreting Results

Each drift finding has a severity:

- **Error** — a hard violation that should be fixed. The exit code will be non-zero.
- **Warning** — a soft violation worth investigating but not blocking.

Findings include the check name, a description of what was found, and usually a suggestion for how to fix it.

## Drift in CI

A common setup is to run drift detection in CI alongside tests and linting:

```yaml
# GitHub Actions example
- name: Drift check
  run: telesis drift
```

Because `telesis drift` exits 1 on errors, a failing drift check blocks the build. This keeps your implementation honest against your spec — you can't merge code that violates your stated architecture without updating the architecture first.

## Drift After Every Change

The recommended post-code-change checklist includes drift detection:

1. `pnpm run format` — formatter
2. `pnpm run lint` — type checking
3. `pnpm test` — tests pass
4. `pnpm run build` — compiles
5. `telesis drift` — zero errors
6. `telesis context` — regenerate CLAUDE.md if docs changed

Running drift after every change is fast (it's all local checks, no model calls) and catches issues before they compound.

## Custom Drift Checks

Drift checks are registered in the Telesis source. The current set of checks is tailored to Telesis's own conventions (TypeScript, Commander, Anthropic SDK, RxJS). When using Telesis on your own project, the structural and consistency checks apply broadly. Import discipline checks will need customization if your project has different containment patterns.
