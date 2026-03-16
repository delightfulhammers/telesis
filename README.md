# Telesis

**Development intelligence platform** — the feedback and control system around autonomous coding agents.

Telesis is the operating layer between the human who defines what to build and the agents who build it. It captures design intent, tracks progress, detects drift, orchestrates the full development lifecycle, and ensures the output stays aligned with the vision — across sessions, milestones, and contributors.

## Install

```bash
# Public repo (once published):
curl -fsSL https://raw.githubusercontent.com/delightfulhammers/telesis/main/install.sh | sh

# Private repo (requires GITHUB_TOKEN):
GITHUB_TOKEN=ghp_... bash <(curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/delightfulhammers/telesis/contents/install.sh")
```

Requires macOS or Linux (arm64/x64). Downloads both `telesis` and `telesis-mcp` binaries.

## Quick Start

```bash
# Initialize a new project (AI-powered interview)
telesis init

# Check project status
telesis status

# Detect drift between spec and implementation
telesis drift

# Run a multi-persona code review
telesis review

# Drive the orchestrator (intake → plan → execute → review → ship)
telesis orchestrator run
```

## What Telesis Does

- **Captures intent** — AI-powered initialization interview produces VISION.md, PRD.md, ARCHITECTURE.md, MILESTONES.md
- **Tracks progress** — milestones with acceptance criteria, validation gates, completion automation
- **Detects drift** — 14 automated checks catch spec-implementation divergence
- **Reviews code** — multi-persona review with convergence detection, dismissal tracking, theme extraction
- **Orchestrates development** — deterministic state machine drives intake → triage → planning → execution → review → milestone completion with 7 human decision points
- **Dispatches agents** — sends tasks to Claude Code (or any ACP-compatible agent) with oversight observers
- **Maintains memory** — design journal, development notes, ADRs, TDDs — persistent context across sessions
- **Enforces process** — Claude Code hooks gate git operations on preflight checks; the orchestrator cannot skip steps

## Architecture

Single TypeScript codebase compiled to static binaries with Bun. Two binaries:

- **`telesis`** — CLI (Commander.js) for all operations
- **`telesis-mcp`** — MCP server exposing 27 tools and 6 resources for Claude Code integration

The orchestrator runs inside the daemon process as a deterministic state machine with targeted LLM calls for judgment (triage grouping, TDD assessment). See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

## Commands

| Command | Description |
|---------|-------------|
| `telesis init` | Initialize project with AI-powered interview |
| `telesis context` | Regenerate CLAUDE.md |
| `telesis status` | Project state summary |
| `telesis drift` | Detect spec-implementation drift |
| `telesis review` | Multi-persona code review |
| `telesis milestone check\|complete` | Milestone validation and completion |
| `telesis orchestrator run\|status\|approve\|reject` | Drive the development lifecycle |
| `telesis intake github\|list\|show` | Import and manage work items |
| `telesis plan create\|execute\|approve` | Task decomposition and execution |
| `telesis dispatch run\|list\|show` | Agent dispatch with oversight |
| `telesis journal add\|list\|show` | Design journal |
| `telesis note add\|list` | Development notes |
| `telesis adr\|tdd new` | Architecture decisions and design docs |
| `telesis update` | Self-update to latest release |

See the [CLI Reference](docs/user-guide/cli-reference.md) for complete documentation.

## Updating

```bash
telesis update
```

The daemon also checks for updates daily and notifies when a new version is available.

## Development

```bash
git clone https://github.com/delightfulhammers/telesis.git
cd telesis
pnpm install
pnpm run build    # Compile both binaries
pnpm test         # Run all tests
pnpm run lint     # Type check
pnpm run format   # Format code
```

## Documentation

- [Vision](docs/VISION.md) — the foundational why
- [Product Requirements](docs/PRD.md) — commands, user journeys, scope
- [Architecture](docs/ARCHITECTURE.md) — system design and package structure
- [Milestones](docs/MILESTONES.md) — acceptance criteria and progress
- [User Guide](docs/user-guide/) — comprehensive usage documentation

## License

Private — Delightful Hammers
