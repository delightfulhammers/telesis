# TDD-025 — Declarative Drift Containment

**Status:** Accepted
**Date:** 2026-04-05
**Author:** Delightful Hammers
**Related:** v0.34.0 milestone

---

## Overview

Telesis drift checks are hardcoded TypeScript files in `src/drift/checks/`. Adding a new
containment rule requires modifying Telesis source code. User projects cannot declare their
own containment boundaries.

This TDD adds a `drift.containment` config section that lets any project declare import
containment rules in `.telesis/config.yml`. The drift engine reads these rules and generates
`DriftCheck` objects at runtime, using the same `scanForPattern()` infrastructure as the
hardcoded checks.

### What this TDD addresses

- `drift.containment` config format: import pattern, allowed paths, severity, description
- Runtime `DriftCheck` generation from config rules
- Integration with existing drift runner (merged with `allChecks`)
- Config parser `parseDriftConfig()`
- Language-aware scanning (Go, Python, TypeScript, etc.)

### What this TDD does not address (scope boundary)

- Migrating existing hardcoded checks to config (they stay as code)
- Containment discovery agent (suggests rules from import graphs)
- TDD-driven auto-generation of containment rules
- Non-import containment (e.g., "no function calls to X outside of Y")

---

## Config Format

```yaml
drift:
  containment:
    - import: "database/sql"
      allowedIn: ["internal/db/"]
      description: "Database access is contained to internal/db/"
      severity: error          # default: error

    - import: "@aws-sdk/client-s3"
      allowedIn: ["src/storage/"]

    - import: "express"
      allowedIn: ["src/api/", "src/middleware/"]
      severity: warning
      excludeTests: true       # default: true
```

| Field | Required | Default | Description |
|---|---|---|---|
| `import` | Yes | — | Import pattern to detect (substring match in import/require statements) |
| `allowedIn` | Yes | — | Path prefixes where the import is allowed |
| `description` | No | Auto-generated | Human-readable description |
| `severity` | No | `error` | Finding severity: `error`, `warning` |
| `excludeTests` | No | `true` | Skip test files (`*.test.*`, `*_test.*`) |

### Import pattern matching

The `import` field is converted to a regex that matches import/require statements:

```
"database/sql"  →  /(?:import|require)\s*(?:\(|.*from\s*)["']database\/sql/
"express"       →  /(?:import|require)\s*(?:\(|.*from\s*)["']express/
```

This matches:
- `import ... from "express"`
- `import "express"`
- `require("express")`
- `import ... "database/sql"` (Go)

For Go, the pattern also matches bare import strings:
- `"database/sql"` (inside an import block)

---

## Types

```typescript
interface ContainmentRule {
  readonly import: string;
  readonly allowedIn: readonly string[];
  readonly description?: string;
  readonly severity?: "error" | "warning";
  readonly excludeTests?: boolean;
}

interface DriftConfig {
  readonly containment?: readonly ContainmentRule[];
  readonly expectedDirectories?: readonly string[];
}
```

---

## Architecture

```
.telesis/config.yml
  drift:
    containment:
      - import: "database/sql"        ←  user-defined rule
        allowedIn: ["internal/db/"]

        ↓ parseDriftConfig()

ContainmentRule[]
        
        ↓ buildContainmentChecks()

DriftCheck[]                           ←  same interface as hardcoded checks
        
        ↓ merged with allChecks

runChecks(allChecks ++ configChecks)   ←  existing runner, no changes
```

### `src/drift/containment.ts` (NEW)

```typescript
/** Build DriftCheck objects from declarative containment rules. */
export const buildContainmentChecks = (
  rules: readonly ContainmentRule[],
): readonly DriftCheck[];
```

Each rule produces one `DriftCheck` with:
- `name`: `containment:<import-pattern>` (e.g., `containment:database/sql`)
- `run`: uses `scanForPattern()` with generated regex, filters by `allowedIn` prefixes
- `severity`: from rule (default `error`)

### `src/config/config.ts` (MODIFY)

Add `parseDriftConfig()` following the existing `parse*Config()` pattern.

### `src/cli/drift.ts` (MODIFY)

Merge config-generated checks with `allChecks`:
```typescript
const driftConfig = parseDriftConfig(rawConfig);
const configChecks = buildContainmentChecks(driftConfig.containment ?? []);
const allDriftChecks = [...allChecks, ...configChecks];
const report = runChecks(allDriftChecks, rootDir, opts.check, ...);
```

### `src/mcp/tools/drift.ts` (MODIFY)

Same merge pattern as the CLI.

---

## Decisions

1. **Config checks augment, not replace, hardcoded checks.** Telesis's own checks
   stay as code. Config checks are additional. A project can declare its own rules
   without conflicting with built-in checks.

2. **Name prefix `containment:`.** Config-generated checks are namespaced to avoid
   collision with built-in check names. Users can filter with `--check containment:express`.

3. **Default `excludeTests: true`.** Test files commonly import packages they're testing.
   Requiring users to list test directories in `allowedIn` would be noisy. Opt-out
   rather than opt-in.

4. **Substring match, not exact.** `import: "express"` matches any import containing
   "express" (including `express-session`). For exact matching, users can use a more
   specific string. This matches how the hardcoded checks work.

5. **Severity configurable per-rule.** Some containment violations are hard errors
   (database driver outside `db/`); others are warnings (utility imports that should
   be centralized but aren't critical).

---

## Testing Strategy

- `src/drift/containment.test.ts`: rule → DriftCheck generation, pattern matching,
  allowedIn filtering, severity, excludeTests, edge cases
- `src/config/config.test.ts`: `parseDriftConfig()` with valid/invalid/missing rules
- Integration: full drift run with config-based rules on a temp directory
