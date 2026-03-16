---
title: Installation
description: How to install Telesis and verify your setup
weight: 10
---

# Installation

Telesis is a TypeScript application compiled to a single static binary using Bun. It runs on macOS and Linux.

## Prerequisites

Before installing Telesis, you need:

- **Node.js 18+** or **Bun** — Telesis uses Bun for compilation, but `pnpm` for package management during development.
- **Git** — Telesis operates on git repositories and uses git for branching, committing, and pushing.
- **An Anthropic API key** — Telesis uses Claude for its AI-powered features (initialization interview, code review, planning, validation). Set the `ANTHROPIC_API_KEY` environment variable.

Optional, depending on your workflow:

- **A GitHub personal access token** — Required for `telesis intake github`, PR creation, and issue management. Set the `GITHUB_TOKEN` environment variable.
- **An ACP-compatible agent** — Required for `telesis dispatch` and `telesis run`. The default agent is Claude Code (`claude`), but any ACP-compatible agent works.

## Quick Install

The fastest way to install Telesis:

```bash
curl -fsSL https://raw.githubusercontent.com/delightfulhammers/telesis/main/install.sh | sh
```

This detects your platform (macOS/Linux, arm64/x64), downloads the latest release from
GitHub, and installs both `telesis` and `telesis-mcp` to your PATH.

To install a specific version:

```bash
TELESIS_VERSION=v0.27.0 curl -fsSL https://raw.githubusercontent.com/delightfulhammers/telesis/main/install.sh | sh
```

To install to a custom directory:

```bash
TELESIS_INSTALL_DIR=~/bin curl -fsSL https://raw.githubusercontent.com/delightfulhammers/telesis/main/install.sh | sh
```

## Updating

Check for updates:

```bash
telesis update --check
```

Install the latest version:

```bash
telesis update
```

The daemon also checks for updates daily and sends an OS notification when a new version
is available.

## Installing from Source

Clone the repository and build:

```bash
git clone https://github.com/delightfulhammers/telesis.git
cd telesis
pnpm install
pnpm run build
```

The build step compiles Telesis into a single binary using `bun build --compile`. The output binary is self-contained — no runtime dependencies required.

## Running in Development

For development or trying Telesis without building:

```bash
bun run src/index.ts
```

This runs Telesis directly from source. All CLI commands work identically.

## Verifying Your Installation

Run `telesis --help` to verify the binary works:

```bash
telesis --help
```

You should see a list of all available commands. To verify your API key is configured:

```bash
telesis status
```

If you haven't initialized a project yet, this will tell you to run `telesis init` first — that's expected.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Authenticates model calls for all AI features |
| `GITHUB_TOKEN` | For GitHub features | Used by `telesis intake github`, PR creation, issue management |
| `BOP_GITHUB_TOKEN` | No | Legacy: for bop integration (if using external bop reviews) |

## Shell Completion

Telesis uses Commander.js for its CLI. You can generate shell completions by following Commander's completion documentation for your shell (bash, zsh, fish).

## Next Steps

Once installed, head to [Quick Start]({{< relref "quickstart" >}}) to initialize your first project.
