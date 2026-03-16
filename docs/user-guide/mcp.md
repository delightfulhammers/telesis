---
title: MCP Server
description: Exposing Telesis capabilities to Claude Code and other MCP clients
weight: 250
---

# MCP Server

Telesis ships a separate `telesis-mcp` binary that exposes all capabilities as
[Model Context Protocol](https://modelcontextprotocol.io/) (MCP) tools and resources.
This allows Claude Code or any MCP client to call Telesis operations directly.

## Setup

Configure Claude Code to use the MCP server by adding it to your project's
`.mcp.json`:

```json
{
  "mcpServers": {
    "telesis": {
      "command": "/path/to/telesis-mcp"
    }
  }
}
```

The server inherits its working directory from the client. It walks upward looking
for `.telesis/config.yml`, just like the CLI.

## Tools

The MCP server exposes 27 tools:

### Project State
- **telesis_status** — project metadata, ADR/TDD counts, token usage, cost
- **telesis_drift** — run drift detection checks
- **telesis_context_generate** — regenerate CLAUDE.md

### Documentation
- **telesis_adr_new** — create a new ADR from template
- **telesis_tdd_new** — create a new TDD from template
- **telesis_journal_add** / **_list** / **_show** — design journal
- **telesis_note_add** / **_list** — development notes

### Milestones
- **telesis_milestone_check** — validate active milestone
- **telesis_milestone_complete** — run completion steps (no git operations)

### Work Management
- **telesis_intake_list** / **_show** — work items
- **telesis_plan_list** / **_show** / **_approve** — task plans
- **telesis_dispatch_list** / **_show** — dispatch sessions

### Review
- **telesis_review** — run multi-persona code review (LLM-powered)
- **telesis_review_list** / **_show** — past review sessions

### Orchestrator
- **telesis_orchestrator_status** — current state, milestone, pending decisions
- **telesis_orchestrator_run** — advance state machine until decision point or idle
- **telesis_orchestrator_approve** — approve a decision (with optional triage metadata)
- **telesis_orchestrator_reject** — reject with reason
- **telesis_orchestrator_preflight** — preflight checks for commit gating

All tools accept an optional `projectRoot` parameter to override the working directory.
Input validation is enforced via Zod schemas (slug patterns, length caps).

## Resources

Six project documents are exposed as readable MCP resources:

- `telesis://docs/VISION.md`
- `telesis://docs/PRD.md`
- `telesis://docs/ARCHITECTURE.md`
- `telesis://docs/MILESTONES.md`
- `telesis://CLAUDE.md`
- `telesis://config` (parsed config as YAML)

## Design Notes

- The MCP server is a separate binary — no Commander dependency
- Business logic is 100% shared with the CLI
- `telesis_milestone_complete` does **not** perform git operations — it returns
  next steps for the human or orchestrator to execute
- LLM-powered tools note cost and duration in their descriptions
- The `ModelClient` is constructed once at server startup and injected into tools
  via a factory pattern
- When `telesis_orchestrator_run` creates a decision, it pushes a logging message
  to connected clients via `sendLoggingMessage` — Claude Code sees the decision
  in its conversation context without polling
