# TDD-002 — Generalized Drift Detection

**Status:** Draft
**Date:** 2026-03-10
**Author:** Delightful Hammers
**Related:** v0.3.0 milestone (initial drift implementation), Issue #28, Issue #30

---

## Overview

v0.3.0 introduced drift detection with six structural checks that validate the Telesis
codebase against claims in its spec documents. The framework layer (types, runner, scan,
format) is project-agnostic, but every check implementation is hardcoded to Telesis-specific
conventions: directory paths, package names, file patterns, PRD heading format.

This TDD designs the generalization needed for drift detection to work on arbitrary
codebases — any project that uses Telesis for project intelligence should be able to define
and run drift checks without forking or rewriting the check implementations.

### What it does

1. Provides a **check template** system where common check patterns (import containment,
   directory structure, test colocation) are parameterized and configured per-project
2. Supports **custom checks** as code for project-specific validations that don't fit
   templates
3. Introduces **language-aware file scanning** so drift detection works beyond TypeScript
4. Establishes the **contract for model-based checks** to coexist with deterministic ones
5. Optionally derives check parameters from spec documents (ARCHITECTURE.md, PRD.md)
   rather than requiring manual configuration

### What it does not do (scope boundary)

- Does not implement auto-repair or auto-fix for detected drift
- Does not add CI integration (GitHub Actions, etc.)
- Does not implement the model-based checks themselves — only the contract
- Does not build a plugin/package ecosystem for third-party checks
- Does not add a watch mode or filesystem event listener

---

## Design Decisions

### 1. Check Templates over Check Plugins

The six v0.3.0 checks fall into three recognizable **patterns**:

| Pattern | v0.3.0 Checks | Parameterization |
|---------|---------------|------------------|
| Import containment | sdk-import, commander-import | `{package, allowedPaths}` |
| Call-site containment | no-process-exit | `{pattern, allowedPaths}` |
| Structure validation | expected-directories, test-colocation, command-registration | Various |

Rather than a plugin system (npm packages, dynamic loading, version management), drift
checks generalize through **check templates** — parameterized factory functions that produce
`DriftCheck` instances from configuration.

**Why templates over plugins:**
- Plugins require a package ecosystem, versioning, and trust boundaries — premature for
  a tool at this stage
- The check patterns are few and well-defined; parameterization handles the variance
- Templates keep checks as plain data in config, not code the user must write and maintain
- Custom checks (code) remain available as an escape hatch for anything templates can't
  express

```typescript
interface CheckTemplate<TParams> {
  readonly name: string;
  readonly description: string;
  readonly create: (params: TParams) => DriftCheck;
}
```

### 2. Configuration-Driven Check Definitions

Checks are defined in `.telesis/config.yml` under a `drift` section. Each entry references
a template and supplies parameters. This keeps check definitions alongside other project
configuration rather than scattered across code files.

```yaml
drift:
  checks:
    - template: import-containment
      name: sdk-import-containment
      severity: error
      params:
        package: "@anthropic-ai/sdk"
        allowedFiles: ["src/agent/model/client.ts"]
        language: typescript

    - template: import-containment
      name: commander-containment
      severity: error
      params:
        package: commander
        allowedPrefixes: ["src/cli/"]
        allowedFiles: ["src/index.ts"]
        language: typescript

    - template: call-site-containment
      name: no-process-exit
      severity: error
      params:
        pattern: "process\\.exit"
        allowedPrefixes: ["src/cli/"]
        language: typescript

    - template: expected-directories
      name: directory-structure
      severity: warning
      params:
        directories:
          - src/cli
          - src/config
          - src/agent/model
          # ... project-specific list

    - template: test-colocation
      name: test-colocation
      severity: warning
      params:
        sourceDir: src
        testSuffix: ".test.ts"
        excludeDirs: ["cli", "templates"]
        excludeFiles: ["types.ts", "index.ts"]
        language: typescript

    - template: command-registration
      name: command-registration
      severity: warning
      params:
        prdPath: docs/PRD.md
        prdPattern: "^###\\s+`telesis\\s+([^`\\s]+)"
        registryPath: src/index.ts
        registryPattern: "\\.addCommand\\((\\w+)Command\\)"
```

**Fallback behavior:** When no `drift.checks` section exists in config, Telesis falls back
to the current hardcoded check set. This preserves backward compatibility and provides
sensible defaults for Telesis-initialized projects. The `telesis init` agent can generate
an appropriate drift config based on the interview.

### 3. Custom Checks as Code

Templates handle the common patterns, but projects will have validation needs that don't
fit any template. Custom checks are TypeScript files that export a `DriftCheck`:

```yaml
drift:
  checks:
    - custom: .telesis/checks/api-versioning.ts
      name: api-versioning
```

```typescript
// .telesis/checks/api-versioning.ts
import type { DriftCheck } from "telesis/drift";

export default {
  name: "api-versioning",
  description: "All API routes include version prefix",
  requiresModel: false,
  run: (rootDir) => {
    // project-specific validation logic
  },
} satisfies DriftCheck;
```

Custom checks are loaded via dynamic `import()` at runtime. They live in the project repo
(typically `.telesis/checks/`) and are version-controlled with the project.

**Security consideration:** Custom checks execute arbitrary code with the same permissions
as Telesis itself. This is acceptable because they are committed to the project repo — the
same trust boundary as any other project code.

### 4. Language-Aware File Scanning

The current `findTypeScriptFiles` utility is hardcoded to `.ts` files. Generalizing drift
detection requires scanning files in any language the project uses.

```typescript
interface LanguageConfig {
  readonly extensions: readonly string[];
  readonly excludePatterns: readonly string[];  // e.g., .d.ts for TypeScript
  readonly excludeDirs: readonly string[];      // e.g., node_modules, __pycache__
  readonly testSuffix: string;                  // e.g., .test.ts, _test.go, _test.py
}

const LANGUAGES: Record<string, LanguageConfig> = {
  typescript: {
    extensions: [".ts", ".tsx"],
    excludePatterns: [".d.ts"],
    excludeDirs: ["node_modules"],
    testSuffix: ".test.ts",
  },
  python: {
    extensions: [".py"],
    excludePatterns: [],
    excludeDirs: ["__pycache__", ".venv", "venv"],
    testSuffix: "_test.py",  // or test_*.py — configurable
  },
  go: {
    extensions: [".go"],
    excludePatterns: [],
    excludeDirs: ["vendor"],
    testSuffix: "_test.go",
  },
};
```

`findTypeScriptFiles` becomes `findSourceFiles(dir, language, exclude?)` — same recursive
walk, parameterized by language config. The v0.3.0 function remains as a convenience alias
for backward compatibility.

**Shared scan context (Issue #30):** Currently each check independently calls
`findTypeScriptFiles`, resulting in N redundant filesystem traversals. The generalized
design introduces a `ScanContext` that caches the file list and file contents per run:

```typescript
interface ScanContext {
  readonly rootDir: string;
  readonly files: (language: string, exclude?: readonly string[]) => readonly string[];
  readonly contents: (relativePath: string) => string;
}
```

The runner creates a `ScanContext` before invoking checks and passes it to each check's
`run` method. This is a breaking change to the `DriftCheck` interface:

```typescript
interface DriftCheck {
  readonly name: string;
  readonly description: string;
  readonly requiresModel: boolean;
  readonly run: (ctx: ScanContext) => DriftFinding;
}
```

File contents are lazily loaded and cached — only files that checks actually read are loaded
into memory. This keeps memory usage proportional to what's checked, not the size of the
codebase.

### 5. Model-Based Check Contract

The `requiresModel` field exists in v0.3.0 but is unused. The generalized design defines
the contract for model-based checks without implementing specific ones.

Model-based checks differ from deterministic checks in three ways:
1. They are **async** (model calls are network I/O)
2. They require a **ModelClient** instance
3. Their results are **non-deterministic** (may vary between runs)

The `DriftCheck` interface extends to support both:

```typescript
interface DriftCheck {
  readonly name: string;
  readonly description: string;
  readonly requiresModel: false;
  readonly run: (ctx: ScanContext) => DriftFinding;
}

interface ModelDriftCheck {
  readonly name: string;
  readonly description: string;
  readonly requiresModel: true;
  readonly run: (ctx: ScanContext, model: ModelClient) => Promise<DriftFinding>;
}

type AnyDriftCheck = DriftCheck | ModelDriftCheck;
```

The runner handles both: deterministic checks run synchronously, model checks run with
`await`. The `--no-model` flag (or absence of an API key) skips model-based checks
gracefully, reporting them as `skipped` rather than `failed`.

**Example model-based checks (future):**
- Architecture doc describes a pattern; model verifies code follows it
- PRD describes behavior; model checks if tests cover it
- Convention doc states a rule in natural language; model validates compliance

### 6. Spec Parsing: Pragmatic Extraction

Issue #28 asks whether expected directories and command registrations should be derived
from ARCHITECTURE.md rather than hardcoded. The answer is **yes, but carefully.**

Markdown is a presentation format, not a data format. Parsing it reliably requires
conventions about how information is structured. Telesis already controls the document
templates, so it can enforce parseable conventions:

**Directory structure:** ARCHITECTURE.md uses an indented code block under a "Repository
Structure" heading. A parser can extract directory paths from this block. The convention
is already consistent across Telesis-generated docs.

**Command registration:** PRD.md uses `### \`telesis <command>\`` headings. This is already
the pattern the v0.3.0 check relies on.

The design supports both modes:
- **Explicit config** (default): directories and commands listed in `drift.checks` params
- **Spec-derived** (opt-in): a `source` field points to the document and section to parse

```yaml
drift:
  checks:
    - template: expected-directories
      name: directory-structure
      severity: warning
      params:
        source:
          file: docs/ARCHITECTURE.md
          section: "Repository Structure"
```

Spec-derived mode is a **model-based check** — extracting structured data from prose
reliably requires a model call. This naturally fits the `requiresModel` contract. A
deterministic parser handles the well-structured cases (code blocks, heading patterns);
the model handles ambiguous prose.

---

## Components

### 1. Check Template Registry

A registry of built-in check templates, each a factory function:

```typescript
const TEMPLATES: Record<string, CheckTemplate<unknown>> = {
  "import-containment": importContainmentTemplate,
  "call-site-containment": callSiteContainmentTemplate,
  "expected-directories": expectedDirectoriesTemplate,
  "test-colocation": testColocationTemplate,
  "command-registration": commandRegistrationTemplate,
};
```

Templates are statically registered (same pattern as v0.3.0 checks). Adding a new template
means adding a TypeScript module and registering it — no dynamic discovery.

### 2. Check Resolver

Reads `drift.checks` from config and resolves each entry to a `DriftCheck`:
- Template entries: look up template, validate params, call `create(params)`
- Custom entries: dynamically import the file, validate it exports a `DriftCheck`
- Missing config: fall back to hardcoded v0.3.0 defaults

### 3. Scan Context

Created once per `telesis drift` invocation. Caches file lists and file contents to
eliminate redundant I/O across checks.

```
src/drift/
  scan-context.ts    — ScanContext implementation with lazy caching
  languages.ts       — Language config registry (typescript, python, go, etc.)
```

### 4. Extended Runner

The existing `runChecks` function gains `ScanContext` creation and async support:

```typescript
export const runChecks = async (
  checks: readonly AnyDriftCheck[],
  rootDir: string,
  model?: ModelClient,
  filter?: readonly string[],
): Promise<DriftReport> => {
  const ctx = createScanContext(rootDir);
  // ...run deterministic checks synchronously, model checks with await
};
```

The CLI changes from sync to async accordingly. This is a low-impact change since the CLI
already uses `handleAction` which supports async actions.

---

## Migration Path

The generalization is backward-compatible:

1. **No config:** Existing projects with no `drift.checks` in config get the v0.3.0
   hardcoded checks. Behavior is identical.
2. **Telesis itself:** The hardcoded checks become the default fallback, not dead code.
   Telesis can optionally migrate its own checks to config, serving as the proof case.
3. **New projects:** `telesis init` generates a `drift.checks` config section based on
   interview answers (language, framework conventions, directory structure).
4. **DriftCheck interface change:** The `run(rootDir)` → `run(ctx: ScanContext)` change
   affects all existing check implementations. This is a one-time migration within the
   Telesis codebase; external consumers don't exist yet.

---

## Package Structure

```
src/drift/
  types.ts              — DriftCheck, ModelDriftCheck, AnyDriftCheck, ScanContext, etc.
  scan.ts               — findSourceFiles (generalized from findTypeScriptFiles)
  scan-context.ts       — ScanContext implementation with lazy caching
  languages.ts          — LanguageConfig registry
  runner.ts             — runChecks (async, ScanContext-aware)
  format.ts             — terminal output (unchanged)
  resolve.ts            — config → DriftCheck[] resolver
  templates/
    import-containment.ts
    call-site-containment.ts
    expected-directories.ts
    test-colocation.ts
    command-registration.ts
  checks/               — Telesis-specific hardcoded defaults (fallback)
    index.ts
    sdk-import.ts
    commander-import.ts
    no-process-exit.ts
    expected-directories.ts
    test-colocation.ts
    command-registration.ts
```

The `templates/` directory contains the parameterized factories. The `checks/` directory
retains the v0.3.0 hardcoded implementations as the fallback default.

---

## Open Questions

1. **Config validation:** How strict should template parameter validation be? Fail fast
   on unknown params? Warn? The TDD recommends fail-fast with clear error messages — a
   misconfigured check that silently passes is worse than a startup error.

2. **Check ordering and dependencies:** Should checks be able to declare dependencies on
   other checks? (e.g., "only run test-colocation if expected-directories passes"). The
   TDD recommends **no** — keep checks independent. Dependencies add complexity and make
   partial runs harder to reason about.

3. **Async deterministic checks:** Some deterministic checks might benefit from async I/O
   (e.g., checking remote URLs in docs). Should all checks be async? The TDD recommends
   keeping the sync/async split aligned with `requiresModel` — deterministic checks stay
   sync, model checks are async. If a deterministic check needs async I/O, it's probably
   a model check in disguise.

4. **Test suffix conventions:** Python has both `test_*.py` and `*_test.py`. Go uses
   `_test.go`. Some projects use `__tests__/` directories. The `testSuffix` field in
   `LanguageConfig` handles suffix conventions; directory-based test organization would
   need a `testPattern` field or separate template variant.
