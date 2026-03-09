# ADR-002: Rewrite Go CLI in TypeScript, compile with Bun

## Status

Proposed

## Context

Telesis v0.1.0 was built as a Go CLI. ADR-001 introduced a TypeScript agent layer
alongside it for v0.2.0, creating a two-language system connected through the filesystem
and subprocess calls.

One weekend into the project, the cost of maintaining two languages is already visible:
- The Go CLI must invoke the TypeScript agent as a subprocess
- The two layers share state through filesystem conventions rather than direct imports
- Conventions must be documented twice (Go section, TypeScript section)
- Contributors need both toolchains
- The Go CLI is small (~6 packages of straightforward business logic) — it doesn't
  benefit from Go's concurrency or performance characteristics

Meanwhile, Bun now supports `bun build --compile` to produce single static binaries,
closing the distribution gap that originally justified Go.

Rewriting now — before v0.2.0 adds cross-language coupling — is the cheapest this
decision will ever be.

## Decision

Rewrite the Telesis CLI in TypeScript, compiled with Bun as a single static binary.

### Design decisions

**CLI framework:** Commander.js
- Mature, well-documented, large ecosystem
- Similar command/subcommand model to Cobra
- Straightforward migration path from existing Cobra structure
- yargs is also acceptable (functional style); Commander chosen for Cobra parity

**Template embedding:** Bun file imports
- Bun supports importing files at build time, replacing `go:embed`
- Preferred over inline template literals for separation of concerns

**Project structure after rewrite:**
```
telesis/
  src/
    index.ts              ← CLI entrypoint
    cli/                  ← Commander command definitions
    config/               ← .telesis/config.yml read/write
    context/              ← CLAUDE.md generation
    scaffold/             ← project initialization
    adr/                  ← ADR file management
    tdd/                  ← TDD file management
    status/               ← project status aggregation
    templates/            ← embedded document templates
    agent/                ← AI agent layer (from ADR-001)
      interview/
      generate/
      model/
      telemetry/
  package.json
  tsconfig.json
  bunfig.toml
```

**Testing:** Vitest
- Already chosen for the agent layer in ADR-001
- One test framework for the entire project

**Package manager:** pnpm (already chosen in ADR-001)

**What this supersedes:**
- The Go CLI layer (`cmd/`, `internal/`, `go.mod`, `go.sum`, `templates/`)
- The two-layer architecture from ADR-001 collapses into a single TypeScript codebase
- ADR-001's agent layer design is preserved but lives under `src/agent/` instead of
  a separate `agent/` directory

## Consequences

### What becomes easier

- No subprocess boundary between CLI and agent — direct function calls
- One language, one toolchain, one test framework, one set of conventions
- Shared types between CLI and agent layer
- Contributors only need Node/Bun, not Go + Node
- Template logic can use the same TypeScript utilities as the rest of the codebase

### What becomes harder or riskier

- Bun's `--compile` is newer and less battle-tested than Go's static binary compilation
- Bun binary size may be larger than Go binary
- Losing Go's type system (though TypeScript's is adequate for this use case)
- If Bun's compile story regresses, we'd need to fall back to Node distribution

### Migration approach

- Port each Go package to its TypeScript equivalent
- Preserve the existing test cases (rewrite in Vitest, same scenarios)
- Validate by running `telesis init`, `telesis context`, `telesis adr new`, `telesis tdd new`,
  `telesis status` against the Telesis repo itself and comparing output
- Improvements to CLI ergonomics are welcome as long as the rewrite meets or exceeds
  current functionality per the docs and specs
- Remove Go source after validation
