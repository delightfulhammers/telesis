---
title: Telesis User Guide
description: Comprehensive documentation for the Telesis development intelligence platform
weight: 1
---

# Telesis User Guide

Telesis is a development intelligence platform — a coordinated system of specialized agents that hold the design intent, track progress, detect drift, and steer autonomous development toward the goal.

It is not an IDE, a code editor, or a one-shot reviewer. It is the **operating layer** between the human who defines what to build and the agents who build it.

## What's in This Guide

This guide covers everything you need to use Telesis effectively, from initial setup through advanced orchestration workflows.

### Getting Started

- [Installation]({{< relref "installation" >}}) — install Telesis and verify it works
- [Quick Start]({{< relref "quickstart" >}}) — initialize your first project in five minutes
- [Core Concepts]({{< relref "concepts" >}}) — the mental model behind Telesis

### Using Telesis

- [Project Initialization]({{< relref "initialization" >}}) — the AI-powered interview and what it produces
- [Code Review]({{< relref "review" >}}) — multi-perspective review with personas, dismissals, and convergence
- [Drift Detection]({{< relref "drift" >}}) — keeping implementation aligned with intent
- [Work Intake & Planning]({{< relref "intake-and-planning" >}}) — importing work items and decomposing them into plans
- [The Full Pipeline]({{< relref "pipeline" >}}) — from work item to committed code with `telesis run`
- [Milestones]({{< relref "milestones" >}}) — validation gates and milestone lifecycle
- [Development Notes & Journal]({{< relref "notes-and-journal" >}}) — lightweight memory tools
- [The Daemon]({{< relref "daemon" >}}) — background process, event backbone, and live monitoring
- [Agent Dispatch]({{< relref "dispatch" >}}) — running coding agents with oversight

### Reference

- [CLI Reference]({{< relref "cli-reference" >}}) — every command, flag, and option
- [Configuration Reference]({{< relref "configuration" >}}) — complete `.telesis/config.yml` documentation
- [Event Reference]({{< relref "events" >}}) — all event types emitted by the daemon
- [Project Structure]({{< relref "project-structure" >}}) — what Telesis creates and where it lives

### Advanced Topics

- [Oversight & Observers]({{< relref "oversight" >}}) — autonomous review, architecture, and chronicler agents
- [GitHub Integration]({{< relref "github-integration" >}}) — PR comments, issue management, and dismissal sync
- [Telemetry & Cost Tracking]({{< relref "telemetry" >}}) — understanding model usage and cost
- [ADRs & TDDs]({{< relref "adrs-and-tdds" >}}) — architectural decision records and technical design documents
- [Context Generation]({{< relref "context-generation" >}}) — how `CLAUDE.md` works and why it matters
