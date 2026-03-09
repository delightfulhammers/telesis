# ADR-001 — TypeScript for Agent and Orchestration Layer

**Status:** Superseded by ADR-002
**Date:** 2026-03-08
**Author:** Delightful Hammers

---

## Context

Telesis v0.1.0 is a Go CLI — a single static binary that manages project documents and
generates `CLAUDE.md`. It contains no AI logic. The next milestone introduces the first
genuinely intelligent capability: an AI-powered `telesis init` that interviews the developer
and generates substantive project documents from the conversation.

This requires Telesis to:
- Call LLM APIs (Anthropic and others)
- Manage multi-turn conversations with structured state
- Produce structured outputs (the generated docs)
- Track token usage and cost for every model call
- Eventually orchestrate multiple specialized agents

The Go CLI layer is not the right home for this logic. The question is where the agent and
orchestration layer should live and what language it should be written in.

### The ACP/MCP boundary

The architecture already anticipates Telesis orchestrating coding assistants (Claude Code,
Codex, Gemini CLI) via ACP and MCP. This protocol boundary is load-bearing: it means the
orchestrator and the coding assistant are separate processes, communicating over a stable
interface. The orchestrator language is therefore not constrained by the coding assistant
implementations.

### The TypeScript AI ecosystem

The TypeScript ecosystem has a materially richer set of AI-native libraries than Go:

- Vercel AI SDK — unified provider interface, streaming, structured outputs
- Anthropic and OpenAI SDKs — first-class, actively maintained
- MCP SDK — first-class TypeScript support (reference implementation)
- ACP client libraries (`acpx`) — TypeScript-native
- LangChain, LlamaIndex — TypeScript ports are mature

Go's AI ecosystem is functional but thinner. For a platform that will be spending significant
development time on agent logic, provider integrations, and protocol implementations,
TypeScript has a meaningful productivity advantage.

### Prior art: Pi, OpenClaw, ClawPort

The developer is familiar with Pi (agent framework), OpenClaw (router + integrations + TUI
+ workflow engine), and ClawPort (agent team orchestration) — all TypeScript projects that
follow Claude's agent conventions (agent.md, skills.md, etc.). The patterns are proven and
applicable to Telesis's agent layer without needing to re-derive them.

### Go CLI

The existing Go CLI is working, well-structured, and solves its problem correctly. There is
no reason to rewrite it. The question is only about what gets added, not what gets replaced.  When the fricition appears, or significat cli updates are needed, we will revisit the decision to rewrite it in typescript (bun/deno/node).

---

## Decision

**The Telesis agent and orchestration layer will be written in TypeScript.**

The Go CLI remains Go and continues to handle document management, template rendering, and
CLAUDE.md generation. It is the stable foundation layer.

The TypeScript layer handles everything involving intelligence: model calls, conversation
management, structured output generation, agent orchestration, and telemetry. It runs as a
separate process and communicates with the Go CLI via the filesystem (shared doc structure)
and eventually via ACP.

Specifically:
- A new `agent/` directory (or `packages/agent/`) at the repo root contains the TypeScript
  agent layer
- The init agent is the first occupant — a conversational agent that interviews the developer
  and generates project documents
- Token logging and cost tracking live in this layer from the start, as a shared concern
  for all future agent work
- The Go CLI can invoke the agent binary as a subprocess where needed, or they operate
  independently; the shared interface is the filesystem (`.telesis/`, `docs/`)

### Language version and toolchain

- TypeScript, targeting Node.js LTS (current: 22.x)
- `tsx` for development execution; compiled to CommonJS or ESM for distribution
- `pnpm` for package management (or the existing monorepo toolchain if one is established)

### Key dependencies (initial)

- `@anthropic-ai/sdk` — primary provider
- Vercel AI SDK (`ai`) — provider abstraction for future multi-provider support
- `@modelcontextprotocol/sdk` — MCP client for coding assistant integration
- A structured logging library (`pino` or equivalent) — telemetry foundation

---

## Consequences

### Positive

- Access to the richest AI-native library ecosystem
- Alignment with Claude's agent conventions (agent.md, skills.md, MCP SDK)
- ACP/MCP integrations are first-class
- TypeScript's popularity makes the agent layer more accessible to contributors
- Structured outputs, streaming, and provider abstraction handled by mature libraries
  rather than home-grown Go implementations

### Negative / mitigations

- **Two languages in one repo.** Mitigated by: clean protocol boundary (filesystem +
  ACP), separate directories, no cross-language imports. The seam is designed, not
  accidental.
- **Go developers must context-switch.** Mitigated by: the Go layer doesn't grow much
  after MVP. New feature work concentrates in the TypeScript layer.
- **Build and distribution complexity.** Go produces a single static binary. TypeScript
  requires Node.js at runtime. Mitigation: document the dependency clearly. Long-term,
  compile the agent binary with Bun or pkg if zero-dependency distribution becomes a
  requirement.

### Deferred

- Whether to use a monorepo tool (Turborepo, Nx) is deferred until there are multiple
  TypeScript packages to coordinate
- Multi-provider support beyond Anthropic is deferred until after the init agent is
  working end-to-end
- The exact ACP interface between Go CLI and TypeScript orchestrator is deferred to the
  TDD for the init agent

---

## Alternatives Considered

### Go for everything

Go is capable of calling LLM APIs and managing conversations. The argument for consistency
(one language, one toolchain) is real. Rejected because: the TypeScript AI ecosystem
advantage is significant and will compound as Telesis adds more agent capabilities. The
protocol boundary means the consistency benefit is lower than it appears — the two layers
are already separate concerns.

### Wait until Go AI libraries mature

The Go AI ecosystem is improving. This decision could be revisited in 12-18 months.
Rejected for now because: the init agent is the immediate next milestone and waiting is
not a neutral choice. TypeScript is the right tool for this work today.