---
title: Oversight & Observers
description: Autonomous review, architecture, and chronicler agents
weight: 300
---

# Oversight & Observers

Oversight observers are autonomous agents that watch dispatch sessions in real time. While a coding agent is working on a task, observers monitor its behavior and flag concerns — code quality issues, architectural drift, or interesting insights worth recording.

## How Observers Work

When you dispatch an agent (`telesis dispatch run` or `telesis run`), oversight observers connect to the daemon and watch the session's event stream. Each observer has a specific focus:

- **Reviewer Observer** — watches for code quality issues, bugs, and convention violations in the agent's output
- **Architect Observer** — watches for structural violations and spec drift, flagging when the agent's implementation diverges from the architecture document
- **Chronicler Observer** — extracts insights, decisions, and notable observations from the session and records them as notes

Observers operate asynchronously. They buffer events and periodically drain their buffer for analysis. This means they don't slow down the primary agent — they work in parallel.

## Observer Policies

Each observer's behavior is defined by a policy file in `.telesis/agents/`:

```
.telesis/agents/
├── reviewer.md
├── architect.md
└── chronicler.md
```

Policy files use Markdown with YAML frontmatter. The frontmatter configures the observer; the markdown body is the system prompt.

Example policy file:

```markdown
---
name: reviewer
autonomy: alert
model: claude-sonnet-4-6
trigger: periodic
---

You are a code reviewer observing a coding agent's work in real time.
Your role is to flag code quality issues, bugs, and convention violations.

Focus on:
- Security vulnerabilities
- Error handling gaps
- Violations of the project's import discipline
- Missing or inadequate tests

Do not flag style preferences. Focus on correctness and security.
```

### Autonomy Levels

| Level | Behavior |
|---|---|
| `observe` | Silently record observations (only writes notes) |
| `alert` | Emit findings as oversight events (visible in TUI) |
| `intervene` | Can pause or redirect the agent session |

### Trigger Modes

| Mode | Behavior |
|---|---|
| `periodic` | Analyze buffered events on a regular interval |
| `on-event` | Analyze immediately on specific event types |

## Enabling Oversight

Oversight is enabled automatically when observer policy files exist in `.telesis/agents/`. You can also configure it explicitly:

```yaml
oversight:
  enabled: true
  defaultModel: claude-sonnet-4-6
```

### Disabling Oversight Per-Session

```bash
telesis dispatch run "Quick fix" --no-oversight
```

## Oversight Events

Observers emit events through the daemon backbone:

- `oversight:finding` — an issue was flagged (includes observer name, severity, summary, detail, and the event range that triggered it)
- `oversight:note` — an observation was recorded (includes text and tags)
- `oversight:intervention` — the observer intervened in the session (includes reason)

Monitor these in real time:

```bash
telesis daemon tui
```

## Chronicler Notes

The chronicler observer is unique — instead of flagging issues, it extracts insights. When it observes something noteworthy (a design decision, a non-obvious approach, a rejected alternative), it records a development note. These notes are automatically tagged and stored in `.telesis/notes.jsonl`, contributing to the project's persistent memory.

This means the project accumulates knowledge about why things were done a certain way, even when the work was done by an autonomous agent.
