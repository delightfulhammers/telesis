# TDD-001 — Init Agent

**Status:** Accepted
**Date:** 2026-03-08
**Author:** Delightful Hammers
**Related:** ADR-001 (TypeScript agent layer, superseded), ADR-002 (TypeScript rewrite)

---

## Overview

The init agent replaces the flags-only `telesis init` command with an intelligent,
conversational onboarding experience. It interviews the developer about what they're
building and why, then generates substantive first-draft versions of all project documents
— not skeletons, not placeholders, but real content that a developer would have had to
write themselves.

This is the first AI-native capability in Telesis and the component that crosses the line
from "plain CLI tool" to "development intelligence platform."

### What it does

1. Conducts a structured but natural conversation with the developer
2. Extracts intent: purpose, constraints, architecture direction, success criteria
3. Generates VISION.md, PRD.md, ARCHITECTURE.md, and MILESTONES.md from that conversation
4. Writes `.telesis/config.yml`
5. Invokes `telesis context` to produce the initial CLAUDE.md
6. Logs all model interactions (tokens, cost-derivable data) from the first call

### What it does not do (scope boundary)

- Does not detect drift
- Does not validate existing documents
- Does not orchestrate other agents
- Does not integrate with GitHub, Linear, or any external tool
- Does not replace the CLI's existing document management commands (adr, tdd, context, status)
  — those are already implemented

---

## Components

### 1. Interview Engine

The core conversation loop. Responsible for:
- Maintaining conversation history across turns
- Asking follow-up questions when answers are thin
- Knowing when it has enough to generate
- Keeping the conversation focused and not exhausting the developer

The interview is **not a fixed script.** It has a set of required information it must
collect (see Data Model below), but the path to collecting it is dynamic. The model drives
the conversation; the engine provides structure and termination conditions.

**Required information to collect:**

| Field | Description | Example |
|---|---|---|
| `name` | Project name | `telesis` |
| `owner` | Org or individual | `Delightful Hammers` |
| `purpose` | One-paragraph why | "A control system for autonomous development..." |
| `primaryLanguage` | Main language(s) | `TypeScript, Go` |
| `constraints` | Key non-negotiables | "Single binary, local-first, model-agnostic" |
| `successCriteria` | What done looks like | "Developer can init a project in 5 minutes..." |
| `architectureHints` | Any known structural decisions | "CLI + agent layer, ACP for orchestration" |
| `outOfScope` | Explicit exclusions | "No web UI, no cloud hosting" |

The model may collect additional context beyond this minimum. Everything captured becomes
input to document generation.

**Termination:** The interview ends when either:
- The model determines it has sufficient information (it signals this in a structured field)
- The developer types a sentinel command (e.g., `/generate`, `/done`)
- A maximum turn count is reached (configurable; default: 20 turns)

### 2. Document Generator

Takes the collected interview context and generates each project document in a single,
focused generation call per document. Documents are generated sequentially, with each
subsequent document having access to the previously generated ones as context (so
ARCHITECTURE.md can reference decisions made in VISION.md).

**Generation order:**
1. VISION.md — from interview context alone
2. PRD.md — from interview context + VISION.md
3. ARCHITECTURE.md — from interview context + VISION.md + PRD.md
4. MILESTONES.md — from all of the above

Each generation call uses a document-specific system prompt (see Template System below).
The output is written directly to the filesystem in the standard Telesis document
structure.

### 3. Telemetry Layer

Wraps every model call in the system. Not optional, not added later — present from the
first call.

**Records per model call:**
```typescript
interface ModelCallRecord {
  id: string                    // uuid
  timestamp: string             // ISO 8601
  component: string             // "interview" | "generate:vision" | etc.
  model: string                 // "claude-sonnet-4-20250514"
  provider: string              // "anthropic"
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number      // Anthropic prompt caching
  cacheWriteTokens?: number
  durationMs: number
  sessionId: string             // groups calls from one init run
}
```

**Storage:** Append-only JSONL file at `.telesis/telemetry.jsonl`. Human-readable,
greppable, trivially parseable. Not a database.

**Cost:** NOT stored in telemetry records. Cost is a derived display concern. A separate
`.telesis/pricing.yml` holds model pricing (updated manually or via a future
`telesis pricing update` command). `telesis status` computes cost on read.

This design means telemetry data is never stale even when pricing changes. The raw signal
is always accurate.

**Why JSONL:** Append-only writes avoid read-modify-write races. Each line is a complete
record. Easy to tail, grep, and import into any analysis tool.

### 4. CLI Entrypoint

The `telesis init` command invokes the agent layer directly (no subprocess boundary — see
ADR-002). This entrypoint:

- Sets up the telemetry session
- Instantiates and runs the interview engine
- Hands off to the document generator
- Calls `context.generate()` directly to produce CLAUDE.md
- Reports a summary: documents generated, turns taken, tokens used, estimated cost

---

## Interfaces

### Model Interface

All model calls go through a single `ModelClient` abstraction. This is the only place in
the codebase that imports `@anthropic-ai/sdk` directly. Everything else calls
`ModelClient`.

```typescript
interface ModelClient {
  complete(request: CompletionRequest): Promise<CompletionResponse>
}

interface CompletionRequest {
  model: string
  system?: string
  messages: Message[]
  maxTokens?: number
  // future: tools, structured output schema
}

interface CompletionResponse {
  content: string
  usage: TokenUsage
  durationMs: number
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

`ModelClient` emits a telemetry event after every call. The telemetry layer is wired at
construction time — callers don't think about it.

### Interview State

```typescript
interface InterviewState {
  sessionId: string
  turns: Turn[]
  collectedContext: Partial<ProjectContext>
  complete: boolean
  turnCount: number
}

interface Turn {
  role: "user" | "assistant"
  content: string
}

interface ProjectContext {
  name: string
  owner: string
  purpose: string
  primaryLanguage: string[]
  constraints: string[]
  successCriteria: string
  architectureHints: string
  outOfScope: string[]
  additionalContext: Record<string, string>  // overflow bucket
}
```

The interview engine serializes `InterviewState` to `.telesis/interview-state.json` after
each turn. This enables resuming an interrupted interview (future enhancement) and
provides a record of what the model was told.

### Document Generator Interface

```typescript
interface DocumentGenerator {
  generate(
    doc: DocumentType,
    context: ProjectContext,
    previousDocs: GeneratedDocs
  ): Promise<string>  // returns generated markdown content
}

type DocumentType = "vision" | "prd" | "architecture" | "milestones"

interface GeneratedDocs {
  vision?: string
  prd?: string
  architecture?: string
  milestones?: string
}
```

---

## Data Model

### Filesystem layout (additions to existing structure)

```
.telesis/
  config.yml              ← existing; written by init agent
  telemetry.jsonl         ← NEW; append-only model call log
  interview-state.json    ← NEW; interview session state
  pricing.yml             ← NEW; model pricing config for cost derivation
```

### pricing.yml format

```yaml
# Updated manually or via `telesis pricing update` (future)
# Source of truth: provider pricing pages
lastUpdated: "2026-03-08"
models:
  claude-sonnet-4-20250514:
    provider: anthropic
    inputPer1MTokens: 3.00
    outputPer1MTokens: 15.00
    cacheReadPer1MTokens: 0.30
    cacheWritePer1MTokens: 3.75
```

---

## Template System

Each document type has a generation system prompt embedded in the TypeScript package
(analogous to how the Go CLI embeds document templates).

System prompts are in `src/prompts/` as plain text files, loaded at build time.

Each prompt:
- States the document's purpose and audience
- Provides the expected structure (matching the existing Telesis document conventions)
- Instructs the model to produce substantive content, not placeholders
- Gives the model the project context as a structured block
- Instructs the model to return only the markdown document, no preamble

The generation prompts are **versioned** — the prompt version is stored alongside the
generated document metadata so future re-generation uses the same prompt contract or
explicitly migrates.

---

## TUI / Interaction Model

The interview runs in the terminal as a streaming, turn-by-turn conversation. The model's
responses stream to the terminal as they arrive. The developer types responses and presses
Enter.

**MVP interaction model:** Simple readline loop. No fancy TUI library for MVP.

**Post-MVP:** The OpenClaw TUI patterns (reusable TUI components) are a natural fit here
once the core logic is solid. Deferred.

Visual structure:
```
  telesis init

  I'll ask you a few questions about your project, then generate your
  project documents. Type /done at any time if you'd rather generate
  with what we have.

  ─────────────────────────────────────────────────────────────────

  What are you building?

  > [developer types here]

  ─────────────────────────────────────────────────────────────────

  [model response streams here]

  ─────────────────────────────────────────────────────────────────
```

---

## Package Structure

```
src/agent/                     ← agent layer within the unified codebase
  interview/
    engine.ts                  ← conversation loop
    state.ts                   ← InterviewState types + serialization
    prompts.ts                 ← interview system prompt
  generate/
    generator.ts               ← DocumentGenerator implementation
    prompts/
      vision.txt
      prd.txt
      architecture.txt
      milestones.txt
  model/
    client.ts                  ← ModelClient implementation
    types.ts                   ← CompletionRequest/Response types
  telemetry/
    logger.ts                  ← JSONL append logic
    types.ts                   ← ModelCallRecord type
    pricing.ts                 ← cost derivation from token counts + pricing.yml
```

---

## Error Handling

- Model call failures: retry once with exponential backoff, then surface the error with
  the raw API response. Never silently swallow API errors.
- Interrupted interviews: state is persisted after each turn. Future `telesis init
  --resume` can reload it. For now, interrupted sessions produce no documents and log
  a warning.
- Partial generation: if document generation fails mid-sequence, the successfully
  generated documents are written and the failure is reported. The developer can
  regenerate individual documents manually (future: `telesis generate vision`).
- Telemetry write failures: log to stderr, do not abort the operation. Telemetry is
  important but not more important than completing the task.

---

## Decisions

1. **Interview system prompt design.** Start structured. Consistent structure produces
   consistent documents. Loosen based on real usage feedback once there is data.

2. **Document quality bar.** Target 80% quality — good enough to work from, not perfect.
   The generated documents are the starting point, not the ending point. This aligns with
   the broader Telesis vision: in the full system, the Spec Keeper agent tracks exactly
   this kind of ongoing document refinement as a component of the feedback and control
   loop. The init agent produces the substrate; the system evolves it.

3. **Context generation.** The init agent calls `context.generate()` directly — no
   subprocess boundary (unified TypeScript codebase per ADR-002).

4. **Pricing.yml bootstrapping.** The agent layer owns pricing.yml. It creates the file
   with current defaults on first run if absent.

5. **Model selection.** Both interview and generation default to claude-sonnet. The
   interview is where project intent is extracted — thin or misunderstood interviews
   produce bad documents regardless of generation model quality. Configurable in
   `.telesis/config.yml` for developers who want to tune cost.