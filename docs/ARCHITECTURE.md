# Telesis — Architecture
*By Delightful Hammers*
*Last updated: 2026-03-11*

---

## System Overview

Telesis is a single TypeScript codebase compiled to a static binary with Bun.

The CLI layer handles structured project documentation — initialization, context generation,
ADR/TDD management, and status reporting. The agent layer (v0.2.0+) handles all AI-native
capabilities: model calls, conversation management, structured document generation, and
telemetry.

Both layers share types directly through imports. There is no subprocess boundary, no
filesystem-mediated communication between layers — just function calls.

See ADR-002 for why the original Go CLI was rewritten in TypeScript.

---

## Repository Structure

```
telesis/
  src/
    index.ts              ← CLI entrypoint; wires Commander commands
    cli/                  ← Commander command definitions
      init.ts             ← invokes agent layer for v0.2.0+
      context.ts
      adr.ts
      tdd.ts
      status.ts           ← reads telemetry for cost reporting (v0.2.0+)
      eval.ts             ← document quality evaluation command
      drift.ts            ← drift detection command (v0.3.0+)
      note.ts             ← development notes command (v0.4.0+)
      review.ts           ← code review command (v0.5.0+)
      milestone.ts        ← milestone check + complete commands (v0.9.0)
      daemon.ts           ← daemon start/stop/status/install/tui commands (v0.12.0)
      dispatch.ts         ← dispatch run/list/show commands (v0.13.0)
      intake.ts           ← intake github/list/show/approve/skip commands (v0.15.0)
      plan.ts             ← plan create/list/show/approve/execute commands (v0.16.0)
      handle-action.ts    ← shared error handling for CLI actions
      project-root.ts     ← project root detection
    config/               ← .telesis/config.yml read/write
    context/              ← CLAUDE.md generation from doc tree
    scaffold/             ← project initialization and file generation
    adr/                  ← ADR file management
    tdd/                  ← TDD file management
    status/               ← project status aggregation
    milestones/           ← milestone parsing, validation, and completion (v0.9.0)
      parse.ts            ← extractActiveMilestone, parseActiveMilestone, MilestoneInfo
      check.ts            ← checkMilestone — drift/test/build/lint validation
      complete.ts         ← completeMilestone — status update, version bump, TDD update, context regen
      format.ts           ← formatCheckReport — terminal output for milestone check
    notes/                ← development notes (JSONL store, formatting)
    journal/              ← design journal (JSONL store, formatting, migration) (v0.11.0)
    daemon/               ← daemon process, event bus, socket server, fs watcher (v0.12.0)
      types.ts            ← event discriminated union, socket protocol, config types
      bus.ts              ← RxJS event bus (sole rxjs importer)
      watcher.ts          ← node:fs.watch wrapper with ignore/debounce
      pid.ts              ← PID file management
      socket.ts           ← Unix socket server, NDJSON framing, client tracking
      lifecycle.ts        ← start/stop/status orchestration
      client.ts           ← socket client for CLI/TUI
      entrypoint.ts       ← daemon main loop
      supervision.ts      ← LaunchAgent/systemd unit generation
      tui.ts              ← event stream renderer
    dispatch/             ← ACP agent dispatch, session management (v0.13.0)
      types.ts            ← AgentEvent, SessionMeta, SessionStatus types
      adapter.ts          ← AgentAdapter interface (sole abstraction over agent runtimes)
      acpx-adapter.ts     ← acpx subprocess implementation (sole acpx spawner)
      store.ts            ← session persistence (.meta.json + .events.jsonl)
      context.ts          ← project context assembly for agent consumption
      dispatcher.ts       ← orchestration: context + adapter + store + events
      format.ts           ← CLI output formatting for list/show
    intake/               ← work intake from external sources (v0.15.0)
      types.ts            ← WorkItem, WorkItemStatus, IntakeSyncResult
      source.ts           ← IntakeSource interface, RawIssue
      store.ts            ← per-item JSON persistence in .telesis/intake/
      github-source.ts    ← GitHub IntakeSource adapter
      sync.ts             ← source → normalize → dedupe → store
      approve.ts          ← approval + dispatch bridge
      format.ts           ← CLI list/show formatting
    plan/                 ← planner agent and task execution (v0.16.0)
      types.ts            ← Plan, PlanTask, PlanStatus, PlanTaskStatus
      store.ts            ← per-plan JSON persistence in .telesis/plans/
      validate.ts         ← topological sort (Kahn's), cycle detection, task validation
      prompts.ts          ← system/user prompts for planner agent
      planner.ts          ← LLM-based work item decomposition
      executor.ts         ← sequential task execution via dispatch pipeline
      format.ts           ← CLI list/show formatting
    oversight/            ← active oversight observers for dispatch sessions (v0.14.0)
      types.ts            ← Observer, PolicyFile, OversightFinding, AutonomyLevel types
      policy.ts           ← parse .telesis/agents/<name>.md (YAML frontmatter + body)
      observer.ts         ← generic observer: buffering, periodic analysis, drain
      prompts.ts          ← system prompts for reviewer, architect, chronicler
      reviewer.ts         ← reviewer analyzer: code quality findings
      architect.ts        ← architect analyzer: spec drift detection
      chronicler.ts       ← post-session note extraction via ModelClient + notes store
      orchestrator.ts     ← wire observers to dispatch event stream
      format.ts           ← event digest formatting for model input
    docgen/               ← shared document generation utilities
    eval/                 ← document quality evaluation suite
    drift/                ← drift detection checks and runner (v0.3.0+)
      checks/             ← individual drift check implementations
        sdk-import.ts           ← Anthropic SDK import containment
        commander-import.ts     ← Commander.js import containment
        no-process-exit.ts      ← no process.exit() outside CLI
        expected-directories.ts ← required project directories exist
        test-colocation.ts      ← test files colocated with source
        command-registration.ts ← CLI commands registered in PRD.md
        claude-md-freshness.ts  ← CLAUDE.md matches generated output (v0.7.0)
        stale-references.ts     ← living docs reference existing paths (v0.7.0)
        milestone-tdd-consistency.ts ← complete milestones have accepted TDDs (v0.7.0)
        version-consistency.ts      ← package.json version matches latest complete milestone
        tdd-coverage.ts             ← non-exempt packages have TDD coverage
    github/               ← GitHub CI integration (v0.8.0)
      types.ts            ← GitHubPRContext, PRReviewComment, PostReviewResult
      environment.ts      ← CI detection, PR context extraction from GITHUB_EVENT_PATH
      format.ts           ← Finding → markdown comment body, drift → markdown comment body
      adapter.ts          ← ReviewFinding[] → { event, body, comments[] } mapping
      client.ts           ← Raw fetch wrappers for GitHub REST API (only file that calls fetch)
      dismissals.ts       ← GitHub DismissalSource adapter (v0.10.0)
    templates/            ← embedded document templates (.md.tmpl)
    agent/                ← AI agent layer (v0.2.0+)
      interview/
        engine.ts         ← conversation loop
        state.ts          ← InterviewState types + serialization
        prompts.ts        ← interview system prompt
      generate/
        generator.ts      ← DocumentGenerator implementation
        prompts/          ← per-document generation prompts
      review/
        types.ts          ← ReviewSession, ReviewFinding, PersonaDefinition types
        diff.ts           ← diff resolver (only git interaction point)
        context.ts        ← review context assembler (reads project docs)
        agent.ts          ← core review agent (single-pass + persona parallel calls)
        personas.ts       ← built-in persona definitions + config merge
        orchestrator.ts   ← persona selection heuristics based on diff content
        dedup.ts          ← within-session LLM-based deduplication across personas
        themes.ts         ← cross-round theme extraction from prior sessions
        noise-filter.ts   ← deterministic post-filter for hedging/self-dismissal patterns (v0.8.1)
        verify.ts         ← full-file verification pass to filter false positives (v0.8.1)
        prompts.ts        ← single-pass, persona, dedup, theme, verification, and prior findings prompts
        json-parse.ts     ← shared JSON response parser (fence extraction)
        similarity.ts     ← shared word bag + Jaccard similarity utilities (v0.14.1)
        convergence.ts    ← cross-round finding matcher, convergence detection (v0.14.1)
        store.ts          ← per-session JSONL storage in .telesis/reviews/
        format.ts         ← terminal report formatting (flat + persona-grouped)
        dismissal/        ← review triage feedback loop (v0.10.0, v0.10.1)
          types.ts        ← Dismissal, DismissalReason, DismissalSource types
          store.ts        ← append-only JSONL storage in .telesis/dismissals.jsonl
          source.ts       ← DismissalSignal, DismissalSource platform adapter interface
          stats.ts        ← aggregation by reason/category/severity/persona, noise pattern detection
          format.ts       ← terminal formatting for dismissal list and stats
          matcher.ts      ← deterministic fuzzy matching against dismissed findings (v0.10.1)
          judge.ts        ← LLM judge for semantic re-raise detection (v0.10.1)
      model/
        client.ts         ← ModelClient abstraction (only Anthropic SDK import)
        types.ts          ← CompletionRequest/Response types
      telemetry/
        logger.ts         ← JSONL append logic
        types.ts          ← ModelCallRecord type
        pricing.ts        ← cost derivation from tokens + pricing.yml
  docs/
    VISION.md
    PRD.md
    ARCHITECTURE.md
    MILESTONES.md
    adr/                  ← ADR-NNN-slug.md
    tdd/                  ← TDD-NNN-slug.md
    context/              ← additional CLAUDE.md sections (freeform .md files)
  .telesis/
    config.yml            ← project metadata
    telemetry.jsonl       ← append-only model call log (v0.2.0+)
    interview-state.json  ← interview session state (v0.2.0+)
    pricing.yml           ← model pricing config for cost derivation (v0.2.0+)
    sessions/             ← dispatch session logs (v0.13.0)
      <id>.meta.json      ← session metadata (status, agent, task)
      <id>.events.jsonl   ← append-only agent event stream
    agents/               ← observer policy files (v0.14.0)
      <name>.md           ← YAML frontmatter (config) + markdown body (system prompt)
  CLAUDE.md               ← generated by `telesis context`
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Dependencies

**Runtime:**
- **`commander`** — CLI framework (command parsing, help text, subcommands)
- **`js-yaml`** — YAML read/write for `.telesis/config.yml`
- **`mustache`** — template rendering for document generation

**Agent layer (v0.2.0+):**
- **`@anthropic-ai/sdk`** — primary model provider (imported only in `agent/model/client.ts`)

**Daemon layer (v0.12.0+):**
- **`rxjs`** — reactive event backbone (imported only in `daemon/bus.ts`)

**Dispatch layer (v0.13.0+):**
- **`acpx`** — headless ACP CLI client for agent session management (spawned only from `dispatch/acpx-adapter.ts`). External tool, not a library dependency — must be installed separately (`npm install -g acpx`).

**Dev:**
- **`typescript`** — type checking (`tsc --noEmit` for linting)
- **`vitest`** — test framework
- **`prettier`** — code formatting
- **`bun-types`** — Bun API type definitions

---

## Package Discipline

- **`src/cli/`** contains Commander command definitions — flag parsing, calling into business
  logic packages, printing output. This is the only directory that imports Commander.
- **`src/{config,context,scaffold,adr,tdd,status,milestones,docgen,notes,github}`** contain business
  logic. They know nothing about the CLI framework.
- **`src/agent/model/client.ts`** is the only file that imports `@anthropic-ai/sdk` directly.
  All other code calls `ModelClient`. This is a hard rule — it keeps provider coupling
  contained.
- **`src/daemon/bus.ts`** is the only file that imports `rxjs`. All other daemon code uses
  the `EventBus` interface. Same containment pattern as the model and GitHub clients.
- **`src/dispatch/acpx-adapter.ts`** is the only file that spawns `acpx` subprocesses.
  All other dispatch code uses the `AgentAdapter` interface. Same containment pattern.
- **`src/github/client.ts`** is the only file that calls `fetch` for the GitHub API.
  All other code uses the adapter and format modules. Same containment pattern as the model client.
- **`src/agent/`** packages (`interview/`, `generate/`, `telemetry/`) know nothing about the
  CLI entrypoint. `src/cli/init.ts` wires them together.
- **`src/templates/`** contains Mustache templates imported at build time via Bun file imports.
  No runtime file I/O for templates.

---

## Data Flow

### `telesis init` (v0.2.0+)

```
src/cli/init.ts
  → agent/telemetry → SessionStart()
  → agent/interview/engine.ts (multi-turn conversation loop)
    → agent/model/client.ts → Anthropic API
      → agent/telemetry/logger.ts → .telesis/telemetry.jsonl
    → serialize state → .telesis/interview-state.json
  → agent/generate/generator.ts
    → generate vision   → model/client.ts → write docs/VISION.md
    → generate prd      → model/client.ts → write docs/PRD.md
    → generate arch     → model/client.ts → write docs/ARCHITECTURE.md
    → generate milestones → model/client.ts → write docs/MILESTONES.md
  → config/ → write .telesis/config.yml
  → context/ → generate CLAUDE.md (direct function call)
  → print summary: docs generated, turns taken, tokens used, estimated cost
```

### `telesis context`

```
src/cli/context.ts
  → context.generate(rootDir)
    → config.load(rootDir)
    → scan docs/adr/ for ADR summaries
    → count docs/tdd/ TDD files
    → extract milestone from docs/MILESTONES.md
    → extract principles from docs/VISION.md
    → extract description from docs/VISION.md
    → scan docs/context/*.md for additional sections
    → render claude.md.tmpl
    → write CLAUDE.md
```

### `telesis adr new <slug>`

```
src/cli/adr.ts (parse slug)
  → adr.create(rootDir, slug)
    → adr.nextNumber(adrDir)
      → scan docs/adr/ for highest existing number
    → render adr.md.tmpl with number + slug
    → write docs/adr/ADR-NNN-slug.md
```

### `telesis tdd new <slug>` — same pattern as ADR.

### `telesis status` (v0.2.0+)

```
src/cli/status.ts
  → status.getStatus(rootDir)
    → config.load(rootDir)
    → count ADRs, TDDs
    → read milestone info
    → check CLAUDE.md timestamp
    → read .telesis/telemetry.jsonl → aggregate token counts
    → read .telesis/pricing.yml → derive cost estimate
  → format and print
```

---

## Error Handling

- Business logic packages (`src/`) return errors or throw. They never call `process.exit`.
- CLI commands (`src/cli/`) catch errors via `handleAction` and handle exit behavior.
- User-facing error messages are actionable: *"run `telesis init` first"*, not
  *"config not found"*.
- Model call failures (agent layer): retry once with exponential backoff, then surface the
  error with the raw API response. Never silently swallow API errors.
- Telemetry write failures: log to stderr, do not abort the operation.
- Partial generation: if document generation fails mid-sequence, successfully generated
  documents are written and the failure is reported clearly.

---

## Telemetry and Cost Model

Every model call in the agent layer is logged to `.telesis/telemetry.jsonl` as an
append-only record:

```typescript
interface ModelCallRecord {
  id: string          // uuid
  timestamp: string   // ISO 8601
  component: string   // "interview" | "generate:vision" | etc.
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  durationMs: number
  sessionId: string
}
```

**Cost is not stored in telemetry records.** It is derived at display time from token
counts plus the pricing configuration (`.telesis/pricing.yml`, created at runtime). This
means the raw signal is always accurate even when pricing changes. The `telesis status`
command computes cost on read.

---

## Template System

All generated files use Mustache templates in `src/templates/`, imported at build time via
Bun file imports.

Templates:
- `vision.md.tmpl` — VISION.md skeleton
- `prd.md.tmpl` — PRD.md skeleton
- `architecture.md.tmpl` — ARCHITECTURE.md skeleton
- `milestones.md.tmpl` — MILESTONES.md skeleton
- `adr.md.tmpl` — individual ADR
- `tdd.md.tmpl` — individual TDD
- `claude.md.tmpl` — generated CLAUDE.md

The `telesis context` command is idempotent — same inputs always produce the same output.

### CLAUDE.md Template Completeness

The `claude.md.tmpl` template generates:
- **Project metadata** from `.telesis/config.yml`
- **About This Project** — extracted from VISION.md "The Vision" section
- **Quick Start** — static navigation links
- **Active Milestone** — extracted from MILESTONES.md (first `## ` milestone section)
- **Recent Decisions** — scanned from `docs/adr/` (up to 5 most recent)
- **Key Documents** — static links with ADR/TDD counts
- **Principles** — extracted from VISION.md "Design Principles" section
- **Additional context** — all `.md` files from `docs/context/`, verbatim in
  alphabetical order

The `docs/context/` directory holds project-specific sections for the generated CLAUDE.md.
Any markdown file placed there becomes a section in the output. Working conventions,
project relationships, and other curated guidance for Claude Code sessions belong here.

## Agent Prompt System

Each document type has a generation system prompt in `src/agent/generate/prompts.ts`,
co-located with the generator. Prompt files are versioned — the prompt version
is stored alongside generated document metadata for future re-generation compatibility.

---

## Key Design Decisions

- **Single TypeScript codebase.** The original Go CLI was rewritten in TypeScript once it
  was clear the two-language overhead wasn't justified for the amount of Go code involved.
  Bun's `--compile` provides single-binary distribution. See ADR-002.
- **Commander.js for CLI.** Similar command/subcommand model to the original Cobra
  structure. Straightforward migration path.
- **Bun for compilation.** `bun build --compile` produces a single static binary, closing
  the distribution gap that originally justified Go.
- **Filesystem as the shared state.** `.telesis/` and `docs/` are the canonical project
  state. The CLI reads and writes them. The agent layer reads and writes them. No database.
- **`src/scaffold/` for initialization.** The name avoids any collision with language-level
  `init` conventions.

---

## Testing Strategy

- Unit tests for all `src/` business logic packages using Vitest.
- Test files colocated with source: `config.ts` → `config.test.ts`.
- All tests operate on temp directories to avoid polluting the real filesystem.
- Integration tests for the interview engine and document generator use recorded fixtures
  (not live model calls) to keep tests fast and deterministic.
- Live model call tests are in a separate `tests/live/` directory, tagged, and run
  explicitly (`pnpm test:live`). Never run in CI by default.
