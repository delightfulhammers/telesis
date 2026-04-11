# TDD-029 — Existing Project Onboarding

**Status:** Accepted
**Date:** 2026-04-11
**Author:** Delightful Hammers
**Related:** #121, #122, #123, #124

---

## Overview

Telesis init was designed for greenfield projects. When used on existing projects — especially
monorepos with docs in non-standard locations — it fails in three compounding ways: the
interview can't read existing documentation on disk, doc discovery only checks `docs/` root,
and context generation has no concept of layered doc paths.

This TDD addresses four related problems as a cohesive design:

1. **Doc-aware interview** — the interviewer should read existing documentation, not just
   manifests and dir trees. The interview becomes gap-filling, not greenfield interrogation.
2. **Non-interactive init** — `--non-interactive` skips readline entirely, inferring config
   from discovered docs + manifests. Enables Claude Code, MCP, and CI usage.
3. **Layered doc paths** — monorepo-level docs (conventions, cross-cutting architecture)
   layer with sub-project docs (service design, local ADRs). Context generation merges them.
4. **TDD inlining** — TDD Overview and Interfaces sections are extracted and rendered in
   CLAUDE.md, not just counted.

### What this TDD does not address (scope boundary)

- Bidirectional sync with external doc systems (Confluence, Notion)
- Auto-detection of monorepo root vs sub-project root (user specifies paths)
- Merging or deduplication of conflicting docs across layers
- Changes to the Mustache template engine itself
- Interview UX improvements beyond doc injection (e.g., multi-turn refinement prompts)

---

## Architecture

### Doc Discovery (`src/scaffold/doc-discovery.ts` — new)

A recursive scanner that finds documentation files anywhere in a directory tree. Used by
both the interview (to inject content) and detection (to identify existing-project mode).

```
discoverDocs(rootDir, opts?)
  │
  ├─ Walk tree looking for known doc patterns
  │    ARCHITECTURE.md, PRD.md, VISION.md, MILESTONES.md,
  │    DESIGN.md, ADR-*.md, TDD-*.md, README.md
  │
  ├─ Respect depth limit (default: 4 levels)
  ├─ Skip noise dirs (node_modules, .git, vendor, dist, etc.)
  │
  └─ Return DiscoveredDocs {
       docs: Array<{ relPath, type, content }>
       adrDirs: string[]     // directories containing ADR-*.md files
       tddDirs: string[]     // directories containing TDD-*.md files
     }
```

**Why a separate module?** Discovery is needed by interview prompts, detection, and
potentially `telesis init --docs <path>`. Extracting it avoids duplicating scan logic.

**Token budget:** Discovered doc content injected into interview prompts should be capped
(e.g., 32KB total across all docs, truncating individual docs proportionally). The current
8KB codebase summary cap is far too low for repos with real documentation.

### Interview Changes (`src/agent/interview/prompts.ts`)

The system prompt gains a new section when existing docs are discovered:

```
## Existing Documentation

The following documentation was found in the repository. This content has already
been written — do NOT ask the user to re-explain what is documented here. Instead:

1. Acknowledge what you've learned from these docs
2. Ask only about gaps: intent not captured, decisions not documented, scope not clear
3. Reference specific docs when asking follow-up questions

<existing-docs>
### docs/nats/ARCHITECTURE.md
[content, truncated to budget]

### docs/nats/adr/ADR-003-config-service-storage.md
[content, truncated to budget]
...
</existing-docs>
```

The prompt instruction shift is critical: the interviewer moves from "tell me about your
project" to "I've read your docs — here's what I still need to know."

### Detection Changes (`src/scaffold/detect.ts`)

`detectState()` currently checks four hardcoded paths in `docsDir`. It should use
`discoverDocs()` as a fallback when no docs are found at the default locations:

```typescript
// Current: only checks docs/VISION.md, docs/PRD.md, etc.
// New: if no docs at default paths, run discovery scan
//      if discovery finds docs anywhere → "existing" mode
```

This ensures a monorepo with `docs/nats/ARCHITECTURE.md` is correctly identified as an
existing project, not greenfield.

### Non-Interactive Init (`src/scaffold/unified-init.ts`)

When `--non-interactive` is passed:

1. Run `discoverDocs()` to find existing documentation
2. Skip interview entirely — no readline, no streaming
3. Extract config from discovered docs via LLM (reuse `extractConfigFromDocs` path,
   but feed it richer input from discovery)
4. Generate only missing docs (don't overwrite existing ones)
5. Run scaffold + context generation

The key insight: non-interactive doesn't mean "no LLM" — it means "no human input."
Config extraction and doc generation still use LLM calls, they just don't need a terminal.

### Layered Doc Paths (`src/config/config.ts` + `src/context/context.ts`)

New config section:

```yaml
context:
  layers:
    - path: "../../../../docs/nats"    # relative to project root
      include: [adrs, tdds, context]   # which doc types to pull
    - path: "docs"                      # sub-project (implicit default)
      include: [all]                    # everything
```

**Defaults:** If no `context.layers` is configured, behavior is unchanged — `docs/` is
the only layer with all doc types. This preserves backward compatibility.

**Merge semantics:** Layers are processed in order. Later layers take precedence for
same-named files. For collections (ADRs, TDDs, context files), entries from all layers
are merged (no deduplication — ADR-003 from layer 1 and ADR-001 from layer 2 both appear).

**Context generation changes:** `generate()` in `context.ts` currently hardcodes
`join(rootDir, "docs", "adr")`, etc. It should iterate over configured layers:

```
for each layer in config.context.layers:
  resolve layer.path relative to rootDir
  if "adrs" in layer.include: scan for ADR-*.md
  if "tdds" in layer.include: scan for TDD-*.md
  if "context" in layer.include: scan for context/*.md
  if "vision" in layer.include: extract from VISION.md
  ... etc
```

### TDD Inlining (`src/context/context.ts`)

Replace `countFiles()` for TDDs with a new `scanTDDs()` function that:

1. Reads each `TDD-*.md` file
2. Extracts the Overview section (from `## Overview` to the next `##`)
3. Extracts the Interfaces section (from `## Interfaces` to the next `##`)
4. Extracts status from the frontmatter line (`**Status:** Draft`)
5. Returns structured data for the template

New Mustache template section:

```markdown
## Component Designs

{{#TDDs.items}}
### {{name}} ({{status}})

{{overview}}

{{#interfaces}}
**Interfaces:**
{{interfaces}}
{{/interfaces}}

[Full design → {{path}}]

{{/TDDs.items}}
```

**Cap:** Only inline TDDs with status Draft or Accepted (skip Superseded). Limit to
10 most recent by number to keep CLAUDE.md manageable.

---

## Interfaces

### Doc Discovery

```typescript
// src/scaffold/doc-discovery.ts

interface DiscoveredDoc {
  readonly relPath: string;           // relative to rootDir
  readonly type: "vision" | "prd" | "architecture" | "milestones"
               | "design" | "adr" | "tdd" | "readme";
  readonly content: string;           // file content (may be truncated)
}

interface DiscoveredDocs {
  readonly docs: readonly DiscoveredDoc[];
  readonly adrDirs: readonly string[];  // directories containing ADRs
  readonly tddDirs: readonly string[];  // directories containing TDDs
}

interface DiscoveryOptions {
  readonly maxDepth?: number;          // default: 4, configurable via --depth
  readonly maxTotalBytes?: number;     // default: 32768 (32KB)
  readonly skipDirs?: readonly string[]; // additional dirs to skip
}


function discoverDocs(rootDir: string, opts?: DiscoveryOptions): DiscoveredDocs;
```

### Layered Config

```typescript
// Addition to src/config/config.ts

interface DocLayer {
  readonly path: string;               // relative to project root
  readonly include: readonly DocLayerScope[];
}

type DocLayerScope = "all" | "adrs" | "tdds" | "context"
                   | "vision" | "milestones";

interface ContextConfig {
  readonly layers: readonly DocLayer[];
}

// Config gains optional context field
interface Config {
  readonly project: Project;
  readonly review?: ReviewConfig;
  readonly context?: ContextConfig;
}
```

### TDD Scanner

```typescript
// Addition to src/context/context.ts

interface ScannedTDD {
  readonly name: string;       // e.g., "TDD-029: existing-project-onboarding"
  readonly status: string;     // "Draft", "Accepted", "Superseded"
  readonly overview: string;   // extracted Overview section content
  readonly interfaces: string; // extracted Interfaces section content (may be empty)
  readonly path: string;       // relative path for link
  readonly num: number;        // for sorting
}

function scanTDDs(tddDir: string): { items: ScannedTDD[]; count: number };
```

### CLI Changes

```
telesis init --non-interactive    # skip interview, infer from disk
telesis init --docs <path>        # override doc search root (existing flag, unchanged)
telesis init --depth <n>          # discovery depth limit (default: 4)
```

No new CLI commands. Two new flags: `--non-interactive` and `--depth`.

---

## Data Model

### Config Extension

```yaml
# .telesis/config.yml — new optional section
context:
  layers:
    - path: "../../docs/shared"       # monorepo-level docs
      include: [adrs, context]
    - path: "docs"                     # sub-project docs (default)
      include: [all]
```

When `context.layers` is absent, the default is equivalent to:

```yaml
context:
  layers:
    - path: "docs"
      include: [all]
```

### No new state files

All changes operate on existing config and filesystem. No new JSONL stores, no new
state files, no new directories beyond what scaffold already creates.

---

## Resolved Questions

1. **Discovery depth:** Default 4 levels, configurable via `--depth <n>` CLI flag on
   `telesis init`. 4 is sufficient for typical monorepos; the flag is the escape hatch
   for deeply nested structures.

2. **Doc content in interview:** Full content with truncation (32KB budget). The
   interviewer needs to actually understand what's documented to avoid re-asking.
   Revisit if token cost becomes a problem in practice.

3. **Layer ordering for singular docs:** Both layers are included. For singular docs
   (VISION.md, ARCHITECTURE.md), both monorepo-level and sub-project versions appear
   in CLAUDE.md — they likely cover different scopes (org conventions vs. service design)
   and won't overlap much. The more local (later) layer takes precedence in the case of
   genuine conflict (e.g., contradictory statements). Collections (ADRs, TDDs, context
   files) merge additively across all layers.
