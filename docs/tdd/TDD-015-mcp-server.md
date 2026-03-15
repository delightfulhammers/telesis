# TDD-015 — MCP Server

**Status:** Accepted
**Date:** 2026-03-15
**Author:** Delightful Hammers
**Related:** v0.21.0 milestone

---

## Overview

Telesis currently exposes all capabilities through a Commander.js CLI. The next step on the
roadmap is to expose these same capabilities as MCP (Model Context Protocol) tools, so Claude
Code or any MCP client can act as the orchestrator — reasoning, tool chaining, and
human-in-the-loop come for free from the client.

The business logic is already CLI-framework-agnostic: every `src/cli/*.ts` file calls into
pure business logic functions that return structured data. The MCP server reuses 100% of this
logic — it is a new **adapter layer**, not a rewrite.

One exception: the review pipeline (~360 lines of orchestration) lived entirely in
`src/cli/review.ts`. This TDD covers its extraction into `src/agent/review/pipeline.ts` so
both CLI and MCP can call it.

### What this TDD addresses

- Separate MCP binary (`telesis-mcp`) compiled alongside the CLI binary
- MCP server factory with tool and resource registration
- Parameterized project root resolution shared between CLI and MCP
- 22 MCP tools covering all Telesis operations (status, drift, context, ADR, TDD,
  journal, notes, milestone, intake, plan, dispatch, review)
- 6 MCP resources exposing project documents (VISION, PRD, ARCHITECTURE, MILESTONES,
  CLAUDE.md, config)
- Extraction of review orchestration from `src/cli/review.ts` into
  `src/agent/review/pipeline.ts`

### What this TDD does not address (scope boundary)

- MCP prompts (future: could expose review personas as prompt templates)
- MCP sampling (server requesting completions from the client)
- SSE/HTTP transport (stdio only for now)
- Authentication or access control on tools
- Tool progress notifications or streaming results
- Daemon integration for long-running tool calls
- GitHub/webhook-triggered MCP operations

---

## Architecture

```
Claude Code / MCP Client
        │
        │  stdio (JSON-RPC)
        ▼
┌──────────────────────────────────────────────┐
│              src/mcp-server.ts                │
│  (entrypoint — creates server, stdio transport)│
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │          src/mcp/server.ts              │  │
│  │  createServer(resolveRoot) → McpServer  │  │
│  │                                         │  │
│  │  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ tools/       │  │ resources/     │  │  │
│  │  │  index.ts    │  │  index.ts      │  │  │
│  │  │  status.ts   │  │  docs.ts       │  │  │
│  │  │  drift.ts    │  │                │  │  │
│  │  │  context.ts  │  └────────────────┘  │  │
│  │  │  adr.ts      │                      │  │
│  │  │  tdd.ts      │                      │  │
│  │  │  journal.ts  │                      │  │
│  │  │  notes.ts    │                      │  │
│  │  │  milestone.ts│                      │  │
│  │  │  intake.ts   │                      │  │
│  │  │  plan.ts     │                      │  │
│  │  │  dispatch.ts │                      │  │
│  │  │  review.ts   │                      │  │
│  │  └──────────────┘                      │  │
│  └─────────────────────────────────────────┘  │
│                    │                           │
│                    ▼                           │
│         Existing business logic               │
│    src/{status,drift,context,adr,tdd,...}     │
│    src/agent/review/pipeline.ts (extracted)    │
└──────────────────────────────────────────────┘
```

### New packages

| Package | Purpose |
|---------|---------|
| `src/mcp/` | MCP adapter layer — server factory, tool and resource registration |
| `src/mcp/tools/` | One file per tool group, thin wrappers over business logic |
| `src/mcp/resources/` | MCP resource handlers for project documents |

### New file in existing package

| File | Purpose |
|------|---------|
| `src/agent/review/pipeline.ts` | Extracted review orchestration, callable by CLI and MCP |

### Reused subsystems

| Subsystem | Module |
|-----------|--------|
| Project status | `src/status/status.ts` |
| Drift detection | `src/drift/runner.ts`, `src/drift/checks/index.ts` |
| Context generation | `src/context/context.ts` |
| ADR/TDD creation | `src/adr/adr.ts`, `src/tdd/tdd.ts` |
| Journal storage | `src/journal/store.ts` |
| Notes storage | `src/notes/store.ts` |
| Milestone validation | `src/milestones/check.ts`, `src/milestones/complete.ts` |
| Intake storage | `src/intake/store.ts` |
| Plan storage | `src/plan/store.ts` |
| Dispatch storage | `src/dispatch/store.ts` |
| Review pipeline | `src/agent/review/pipeline.ts` |
| Review storage | `src/agent/review/store.ts` |
| Config | `src/config/config.ts` |

---

## Types

### Root Resolver (`src/mcp/root-resolver.ts`)

```typescript
export type RootResolver = (override?: string) => string;

export const findProjectRoot = (startDir: string): string => { ... };
export const createRootResolver = (defaultCwd: string): RootResolver => { ... };
```

The `findProjectRoot` function is shared with the CLI (`src/cli/project-root.ts` delegates
to it). This eliminates duplication while allowing the MCP server to use `process.cwd()` as
default and each tool to accept an explicit `projectRoot` override.

### Review Pipeline (`src/agent/review/pipeline.ts`)

```typescript
export interface ReviewOptions {
  readonly ref?: string;
  readonly all?: boolean;
  readonly single?: boolean;
  readonly personas?: string;
  readonly dedup?: boolean;
  readonly themes?: boolean;
  readonly verify?: boolean;
}

export interface ReviewResult {
  readonly session: ReviewSession;
  readonly findings: readonly ReviewFinding[];
  readonly convergence?: ConvergenceSummary;
  readonly labeledFindings?: readonly LabeledFinding[];
  readonly filterStats: FilterStats;
  readonly cost: number | null;
  readonly rawFindingCount: number;
  readonly mergedCount?: number;
  readonly activeThemes?: readonly string[];
}

export const runReview = async (
  rootDir: string,
  options: ReviewOptions,
): Promise<ReviewResult> => { ... };
```

### Tool Pattern

Every tool follows the same registration pattern:

```typescript
export const register = (server: McpServer, resolveRoot: RootResolver): void => {
  server.tool(
    "telesis_<name>",
    "<description with cost/duration notes for LLM-powered tools>",
    { /* Zod schema for parameters */ },
    async (params) => {
      try {
        const rootDir = resolveRoot(params.projectRoot);
        const result = businessLogicFunction(rootDir, ...);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: String(err) }], isError: true };
      }
    },
  );
};
```

---

## Key Design Decisions

### 1. Separate binary, shared business logic

The MCP server compiles to `telesis-mcp` — a separate binary from the CLI `telesis`. This
keeps the MCP process lean (no Commander dependency loaded) while sharing 100% of business
logic. The build script compiles both:

```
bun build src/index.ts --compile --outfile telesis && \
bun build src/mcp-server.ts --compile --outfile telesis-mcp
```

### 2. One tool per operation, no mode parameters

Each business logic function gets its own MCP tool with a clear name and Zod schema. This is
idiomatic MCP — the client (Claude Code) sees `telesis_status`, `telesis_drift`,
`telesis_review` etc. as distinct capabilities it can reason about. No "mode" parameters that
collapse multiple operations into one tool.

### 3. Project root from cwd, overridable per-tool

The server inherits `cwd` from the MCP client (standard behavior). Every tool accepts an
optional `projectRoot` parameter to override this. The `RootResolver` abstraction handles
both cases — it walks upward from the starting directory looking for `.telesis/config.yml`,
identical to the CLI behavior.

### 4. All tools including LLM-powered ones

Including `telesis_review` (which calls the Anthropic API and costs money) is intentional.
The tool description notes cost/duration so Claude Code can make informed gating decisions.
The MCP client handles human-in-the-loop confirmation for expensive operations.

### 5. Resources for context, not tool calls

Project documents (VISION.md, MILESTONES.md, etc.) are exposed as MCP resources rather than
tools. This is semantically correct — they're readable context, not actions. Claude Code can
pull them into its context window without executing a tool.

### 6. Review pipeline extraction

The review orchestration (~360 lines) was tightly coupled to `src/cli/review.ts`. Extracting
it into `src/agent/review/pipeline.ts` as a pure function `runReview(rootDir, options) →
ReviewResult` allows both CLI and MCP to share the same pipeline. The CLI becomes a thin
wrapper: call `runReview()`, format output, handle exit codes. The MCP tool calls
`runReview()` and returns JSON.

The filter pipeline functions (`applyFilters`, `applyJudgeFilter`) are also exported from
the pipeline module for unit testing.

### 7. Error handling: isError flag, not thrown exceptions

Every tool wraps its body in try/catch and returns `{ isError: true }` on failure rather than
throwing. This follows the MCP convention — the server stays alive and the client receives a
structured error it can reason about.

---

## Testing Strategy

- **Root resolver**: Unit tests for `findProjectRoot` and `createRootResolver` with temp
  directories, including macOS symlink handling (`/var` → `/private/var`).
- **Server factory**: Integration test that creates a server, connects an in-memory MCP
  client, and verifies `listTools()` and `listResources()` return all expected entries.
- **Tool tests**: Integration tests using `InMemoryTransport.createLinkedPair()` from the
  MCP SDK. Each test creates a real temp project, registers the tool, connects a client,
  calls the tool, and validates the JSON response. Tests cover: status, drift, journal
  (add/list/show), notes (add/list with tag filter), resources (read documents, read config).
- **Pipeline tests**: Unit tests for `applyFilters` with various confidence levels,
  dismissals, round escalation, and anti-patterns. The full `runReview()` function is not
  unit-tested (requires live LLM calls) — it is covered by integration tests in
  `tests/live/`.
- **Registration tests**: Colocated test files for all tool modules verify the `register`
  export exists and is callable.

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.27.1 | MCP server, stdio transport, type definitions |
| `zod` | ^4.3.6 | Schema validation for tool parameters |

Both are runtime dependencies. The MCP SDK's `Client` and `InMemoryTransport` are used in
tests only but ship as part of the SDK package.
