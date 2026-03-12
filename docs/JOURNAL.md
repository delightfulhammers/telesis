# Telesis — Design Journal

A place for exploratory thinking, observations, and emerging ideas. Not decisions
(those are ADRs), not specs (those are TDDs), not requirements (that's the PRD).
This is the messy middle — the thinking that hasn't crystallized yet.

---

## 2026-03-12 — The Shape of the Thing

### Where we are

Telesis has been built deterministic-harness-first: scaffold, context generation,
drift detection, review pipeline, milestone validation. These are the tools that
keep a project honest. They work, and they're valuable — but they're the skeleton,
not the organism.

The original vision was always a multi-agent system: self-driving, self-correcting,
capable of navigating the full development process and producing professional-quality
artifacts (documentation, working code aligned with designs, tested and correct). The
deterministic harness is the foundation that system stands on — you can't have
self-correction without something to correct against.

### The AI-first development problem

Observations from building in an AI-first/AI-only environment:

**The speed asymmetry.** Coding assistants produce code far faster than a human can
review it. The human becomes the bottleneck — not at writing, but at verifying.
Automated code review helps, but reviewing diffs in isolation misses the bigger
question: is this implementation aligned with the project's design and goals?

**The guidance gap.** AI assistants frequently need input, guidance, or correction to
navigate through development tasks. They make locally reasonable decisions that are
globally wrong — correct code that doesn't match the architecture, working features
that drift from requirements, clean implementations that miss the point.

Most of these failure modes can be addressed by an orchestrator (quarterback) with a
handful of specialized agents (teammates). The orchestrator holds the project context
and intent; the agents do focused work within that frame. When an agent drifts, the
orchestrator catches it — not after the PR, but during the work.

**The memory problem.** Context resets between sessions. Every new conversation starts
from scratch, re-reading the same docs, re-discovering the same constraints. The human
carries continuity in their head and re-injects it manually. This doesn't scale. The
project needs its own memory — not just what was decided (ADRs) or what was built (code),
but what was tried, what failed, why things are the way they are.

### The review inversion (and its limits)

Current review flow: CI runs review → findings posted to GitHub → human triages on
GitHub → telesis imports triage decisions back. This creates tight platform coupling
and a sync problem (CI's `.telesis/` is ephemeral).

The proposed inversion: all triage happens via telesis CLI → `.telesis/` is the source
of truth → platforms are notification targets, not data sources.

**The gap:** This only works cleanly when review runs locally. CI review exists because
it's the "second pair of eyes" after the development session — you push and walk away,
CI reviews the full PR diff. CI's `.telesis/` is ephemeral, so findings generated there
can't round-trip through local state without either:

1. Git as sync — CI commits findings back to the branch (ugly but simple)
2. Accept the asymmetry — CI review and local review are different contexts with
   different trade-offs, don't force-unify them
3. External state service — distributed platform complexity, not where we want to go

No conclusion yet. The current artifact-based cache (upload/download review sessions)
is a partial solution but only syncs between CI runs, not CI-to-local.

### Event-driven architecture

Current telesis: sequential CLI commands that read/write files. Each command is
independent — run, produce output, exit.

Emerging idea: an event-driven backbone where agents/services observe events they care
about and respond. The review pipeline emits "findings generated," the triage system
observes and prompts for action, the chronicler observes development events and updates
project memory, the drift checker observes file changes and flags violations.

This could be:
- A long-running daemon with a real event bus
- A lightweight event log (`.telesis/events.jsonl`) processed on each invocation
- Something like RxJS/signals as the runtime backbone
- The orchestrator explicitly directing traffic between agents

The key shift: from "human runs commands" to "system reacts to development events."
The orchestrator becomes the quarterback — it holds the project context, assigns work
to specialized agents, and catches drift in real-time rather than after the fact.

### What the memory layer looks like

Telesis already has pieces of a memory system:
- Notes (`.telesis/notes.jsonl`) — developer observations
- Dismissals (`.telesis/dismissals.jsonl`) — review triage decisions
- Review sessions (`.telesis/reviews/`) — review history and findings
- Telemetry (`.telesis/telemetry.jsonl`) — model call logs
- Living docs (`docs/`) — architecture, requirements, decisions

What's missing:
- **Exploration memory** — "we considered X, Y felt promising, Z is a dead end"
  (this journal is a manual version of that)
- **Process memory** — "last time we changed the adapter layer, we broke the
  feedback loop because..." (the chronicler's job)
- **Intent memory** — "the human wants the review to stop re-raising FilterStats
  location after they've triaged it three times" (dismissals are a primitive version)
- **Session continuity** — context that persists across coding sessions without
  the human manually re-injecting it

The chronicler (v0.11.0) was envisioned as batch extraction from transcripts, but
maybe it's better as a real-time observer that builds project memory as development
happens. The difference: batch processing looks backward; an observer builds memory
forward, in the moment.

### The quarterback model

The core insight: most AI development failures are coordination failures, not
capability failures. The coding assistant can write good code. The reviewer can find
real issues. The drift checker catches real violations. But nobody is making sure
they're all pulling in the same direction, and nobody remembers what happened last time.

The orchestrator's job:
- Hold the project's intent (spec, architecture, constraints)
- Assign work to specialized agents within that frame
- Monitor agent output for alignment with intent (not just correctness)
- Catch drift during work, not after the PR
- Build and maintain project memory as a byproduct
- Surface the right context to the right agent at the right time

This is what telesis becomes. The CLI commands we've built are the agent capabilities.
The orchestrator is the missing piece that ties them together.

### Open questions

1. Is CI review worth the sync complexity, or should review move fully into the
   development session (local-first, pre-push)?
2. What's the minimum viable orchestrator? Is it a daemon, a CLI wrapper, an MCP
   server, or something else?
3. How does the event-driven model interact with the current file-based state?
   Is `.telesis/events.jsonl` enough, or does this need a real runtime?
4. Can the journal concept (this file) evolve into a telesis-managed artifact
   (`telesis journal`) that feeds into context generation?
5. What are the specific agent roles? Reviewer, drift checker, chronicler — what
   else? A "requirements alignment" agent? A "documentation freshness" agent?
6. How does the orchestrator interact with the human? Is it a conversation partner
   (like Claude Code), a background service that interrupts when needed, or a
   dashboard?

---

## 2026-03-12 — Architecture Direction and CI Decision

### Monolithic binary with in-process events

The orchestrator will be a single binary, not a distributed system. In-process event
streams (Node EventEmitter, lightweight observables, or similar) provide the reactive
backbone. Agents are functions within the same runtime that subscribe to an event bus,
not separate processes communicating over a network.

This avoids the entire distributed systems tax: no servers, no ports, no message
brokers, no infrastructure. When the orchestrator runs, it boots, loads `.telesis/`
state, agents react to events within the process lifetime, and state is persisted on
exit. JSONL remains the durable persistence format; the event bus is ephemeral and
in-memory.

Concern noted: JSONL works for append-only logs read by one process at a time (current
usage), but would break down as an event bus with concurrent readers/writers. The
in-process event stream sidesteps this. JSONL is for persistence, not coordination.

### Dropping CI review

**Decision: Remove the telesis CI review workflow.**

Rationale:
- CI review is a *reaction* to code that's already been pushed. By the time findings
  land in a GitHub thread, the development session is over and the context is lost.
- The quarterback vision makes CI review redundant — if the orchestrator catches drift
  during work, review happens in the loop, not after it.
- CI review is the source of the sync problem, the GitHub coupling, and most of the
  review pipeline complexity we've been wrestling with.
- GitHub holds zero importance to this project beyond code hosting and eventual sharing.
  GitHub Actions is ceremony for the sake of ceremony in this context.
- "Works on my machine" is not a real problem that requires CI to solve here.

Options for the transition:
- Reinstate bop in CI as a proven, zero-maintenance safety net (if any CI review wanted)
- Or simply skip CI review entirely and run `telesis review` locally when desired
- Either way, the review pipeline focus shifts from "CI-compatible" to "useful within
  the orchestrator's development loop"

### Impact on backlog

Issues #50-58 are review pipeline polish (feedback loop, sync, GitHub integration).
With CI review going away:
- #58 (summary findings feedback loop) — irrelevant if no CI review
- #56 (extract sync-replies from CLI) — irrelevant
- #51 (dismiss reply to GitHub) — irrelevant
- #55, #57 (architecture cleanup) — low priority, address when touched
- #50, #52, #53 — local review UX, still relevant but lower priority
- #36 (streaming telemetry) — still relevant for large projects

Energy redirects to: orchestrator design, memory system, agent architecture.

---

## 2026-03-12 — Orchestrator Shape, Events, and Agent Roster

### Daemon + TUI + Notifications

The orchestrator will be a **daemon** — a long-running background process with OS-level
supervision (LaunchAgent on macOS, systemd on Linux).

The TUI is a **client** that connects to the daemon over a local socket. It can
detach/reattach without losing state. Multiple clients are possible (TUI, CLI commands
that need daemon state, eventually MCP). The daemon runs headless when no client is
attached.

OS-level notifications (macOS `terminal-notifier` or `osascript`, native Node libs) for
unattended alerts: "drift detected," "milestone gate: 3/5 criteria met."

OpenClaw's gateway is prior art for this pattern: single process, WebSocket control plane,
hot reload for config changes, two-stage agent completion (accepted → streaming → done).
The gateway multiplexes control/RPC + HTTP + UI hooks on a single port. Telesis could
expose the same port for TUI control, CLI queries, and eventually MCP.

### Event model: RxJS

**Decision: Use RxJS for the in-process event backbone.**

Rationale over EventEmitter:
- Backpressure/composition: `debounce`, `throttle`, `buffer`, `switchMap` are essential
  for a daemon processing filesystem events, agent results, and user commands concurrently
- Observable lifecycle: subscriptions clean up properly; EventEmitter listener leaks are
  a classic footgun in long-running processes
- Stream transformation: agents observing compound conditions ("file changed AND drift
  check passed AND no active review") compose naturally with `combineLatest`/`withLatestFrom`
- Team familiarity: prior RxJS experience

Rationale over Signals (Preact signals, TC39 proposal):
- Signals are optimized for UI reactivity, not event-stream processing
- Conceptually similar to RxJS but less mature for daemon workloads

Event format — discriminated union:
```typescript
interface TelesisEvent {
  readonly type: string;        // "file.changed", "drift.detected", "review.complete"
  readonly timestamp: number;
  readonly source: string;      // which agent/watcher emitted it
  readonly payload: unknown;    // type-narrowed by discriminant
}
```

Key discipline: **events are facts** ("this happened"), **commands are directives** ("do
this"). Events flow from agents/watchers to the bus. Commands flow from the orchestrator
to agents. The orchestrator observes events and decides what commands to issue.

The hardest part of eventing is standardizing event formats so consumers are pluggable —
this is correct. The transport is almost interchangeable if the contracts are clean.

### Agent roster: evolved from VISION.md

The original six agents in VISION.md, revisited against what we've built and learned:

| Agent | Core Responsibility | Foundation | Notes |
|-------|-------------------|-----------|-------|
| **Reviewer** | Code quality, correctness, alignment | `telesis review` (v0.5-v0.10) | Fully realized. Battle-tested. |
| **Architect** | Structural integrity, drift, ADR enforcement | `telesis drift` (v0.3) | Reframed: drift + LLM semantic layer. Detects shape violations, circular deps, ADR contradictions. Overlaps resolved with Reviewer: Reviewer owns code quality, Architect owns structural intent. |
| **Spec Keeper** | Spec↔implementation alignment, spec evolution | None | Sharper role: not just detecting divergence (that's drift) but proposing spec updates when implementation reveals new requirements. "The code added retry logic not in the spec. Update spec or remove retry?" |
| **Milestone Tracker** | Progress validation, gate control | `telesis milestone` (v0.9) | Deterministic base exists. LLM layer adds judgment: "criteria #3 says 'handles edge cases' — does it?" |
| **Chronicler** | Provenance trail, decision memory | `telesis note` (v0.4) | The memory system. Records decisions, rationale, rejected paths. Distinct from documentation maintenance. |
| **Test Sentinel** | Test validity, coverage meaning | None | Hardest agent to build well. Needs spec context to know what tests should validate. Catches mock divergence, implementation-detail assertions, meaningless coverage. |

**New agents identified:**

| Agent | Core Responsibility | Foundation | Notes |
|-------|-------------------|-----------|-------|
| **Scribe** | Documentation currency | `telesis context` (v0.1) | Distinct from Chronicler: Scribe maintains docs (CLAUDE.md, ARCHITECTURE.md, PRD.md), Chronicler maintains the provenance trail. `telesis context` on autopilot but smarter. |
| **Planner** | Work breakdown, sequencing | Human-authored plans | Looks at acceptance criteria + codebase + architecture, proposes build sequences. Closes the loop between "what to build" and "how to build it." |

**MVP orchestrator agents (minimum viable swarm):**
1. Reviewer (already built)
2. Architect (drift + semantic layer)
3. Chronicler (memory system)

The others come online incrementally as the orchestrator matures.

### `telesis journal` as managed artifact

The journal feeds naturally into the Chronicler's domain. It is the human-authored
version of what the Chronicler will eventually maintain automatically.

As a first-class command:
- Versioned and tracked in `.telesis/`
- Feeds into context generation (agents can read it)
- Chronicler can eventually append based on observed development events
- Serves as the thinking layer between "messy conversation" and "crystallized ADR"

### Open questions (narrowed)

1. ~~Is CI review worth the sync complexity?~~ **No. Dropped.**
2. ~~What's the minimum viable orchestrator?~~ **Daemon with local socket.**
3. ~~What event model?~~ **RxJS.**
4. How does the TUI connect to the daemon? WebSocket? Unix socket? IPC?
5. What does the MVP daemon actually *do* before agents are wired in? Filesystem
   watching + event logging? Is that useful enough to justify the daemon infrastructure?
6. What's the Chronicler's input? Development events from the daemon? Git hooks?
   Transcript analysis? All of the above?
7. How does the Planner interact with the human? Does it propose plans for approval,
   or does it execute autonomously within milestone boundaries?

---

## 2026-03-12 — OpenClaw Ecosystem Analysis

### The question

Should telesis exist independently, layer on top of OpenClaw, or is it reinventing
something that already exists?

### What OpenClaw is

The OpenClaw ecosystem has three distinct architectural layers:

1. **OpenClaw Gateway** — a messaging router (chat platforms → AI agents). Long-running
   daemon, WebSocket control plane, OS-level supervision (LaunchAgent/systemd), ACP
   protocol for IDE integration. It is a *conversational platform*, not a development tool.

2. **Symphony (caclawphony)** — a development orchestrator that polls Linear for issues,
   creates isolated per-issue workspaces, and dispatches coding agents (Codex) with
   bounded concurrency. GenServer manages poll loop, dispatch, retry with exponential
   backoff, and process monitoring. Status dashboard renders ANSI terminal output. This is
   the closest analog to what telesis wants to become.

3. **Lobster** — a pipeline composition engine. Unix pipes but typed and resumable.
   `command1 | approve --prompt "Continue?" | command2`. Approval gates halt the pipeline
   and return resume tokens. Clean SDK: `new Lobster().pipe(exec('...')).pipe(approve({...})).run()`.

4. **ClawPort** — Next.js web dashboard for monitoring OpenClaw agents. SSE streaming for
   live logs, REST API routes that shell out to `openclaw` CLI, cost tracking, kanban,
   memory browser. Not a TUI.

5. **acpx** — headless CLI client for Agent Client Protocol sessions. JSONL event logs
   with segment rotation, session persistence, JSON-RPC over stdio.

### Symphony vs Telesis — the key comparison

| Aspect | Symphony | Telesis |
|--------|----------|---------|
| What it orchestrates | Single coding agent per issue | Multiple specialized agents per concern |
| Work source | External issue tracker (Linear) | Internal — project's own spec, milestones, drift |
| Agent model | One general-purpose agent with massive prompt | Panel of specialized agents with distinct roles |
| Intelligence | All intelligence in the prompt template | Distributed across agents + deterministic checks |
| Memory | None — each run starts fresh | First-class — project memory persists across sessions |
| Workspace | Per-issue directory copies | The actual project repo |
| Human interaction | Gate states in Linear | TUI + OS notifications for interactive collaboration |
| Orchestration | Poll → dispatch → wait → repeat | Event-driven — observe → react → coordinate |

Symphony is a *batch job runner* for issues. Telesis is a *continuous development
companion* that holds context and reacts to development events. You wouldn't layer
telesis on top of Symphony because Symphony's coordination model (poll Linear → dispatch
agent → wait for completion) doesn't match telesis's needs.

### Verdict: Telesis justifies its existence

**Different problem domain.** OpenClaw routes conversations. Symphony dispatches agents
to issues. Telesis holds project intent, detects drift, orchestrates specialized agents,
and maintains memory across the project lifecycle.

**Different agent model.** OpenClaw treats agents as general-purpose assistants given a
prompt. Telesis treats agents as specialized roles with distinct concerns, tools, and
coordinated oversight.

**Different memory model.** OpenClaw has no project memory. Symphony starts fresh each run.
Telesis's value proposition is persistent context — across sessions, PRs, milestones.

**Different interaction model.** OpenClaw is conversational (chat in, response out).
Telesis is a development companion (observe events, react when needed, pause for human
judgment at gates).

### What to borrow from OpenClaw

**Adopt:**
- Daemon lifecycle management (install/start/stop/status, LaunchAgent/systemd)
- Versioned agent policy file pattern (Symphony's `WORKFLOW.md` → telesis agent configs)
- Lobster's approval/resume pattern for milestone gates
- StatusDashboard's terminal rendering approach for TUI
- acpx's session persistence model (JSONL event logs with segment rotation)
- Symphony's bounded concurrency with backoff retry

**Do not adopt:**
- Messaging/routing architecture (wrong domain)
- Poll-dispatch-wait orchestration loop (telesis needs event-driven, not polling)
- Single-agent-per-issue model (telesis needs multi-agent-per-concern)
- Linear/issue-tracker coupling (telesis's work source is the project itself)
- Web dashboard (stay in the terminal)

### Observations from Symphony's WORKFLOW.md

Symphony's most interesting design choice is putting the entire agent policy — including
the prompt, gate definitions, workspace hooks, and concurrency settings — in a single
versioned file (WORKFLOW.md with YAML front matter + markdown body). The prompt template
uses Mustache variables for issue context.

For telesis, this suggests each agent could have a policy file:
```
.telesis/agents/
  reviewer.md      # review prompt + config (personas, thresholds)
  architect.md     # drift rules + structural intent checks
  chronicler.md    # memory extraction patterns + journal config
```

These would replace the hardcoded prompts in `src/agent/review/prompts/` and make agent
behavior user-configurable. The prompt becomes a contract between the human and the agent,
versioned with the project.

---

## 2026-03-12 — The Full Loop: Telesis as Work Executor

### The missing piece in the vision

The previous entries describe telesis as the *governance layer* — the control system that
watches, validates, and corrects. But the end game is larger: telesis is also the thing
that **dispatches coding agents to do work**.

The full loop:
```
Intake → Understand → Plan → Dispatch → Monitor → Validate → Correct → Complete
```

### How this changes the picture

The specialized agents (Reviewer, Architect, Chronicler...) aren't just watchers. They're
the **support team** around a coding agent that telesis dispatches:

1. **Intake** — work arrives via TUI input, issue tracker feed (Jira, GitHub Issues,
   Linear), or a lightweight interview (evolved from `telesis init`)
2. **Understand** — the orchestrator uses project context (spec, architecture, ADRs,
   memory, prior attempts) to understand what the work requires
3. **Plan** — the Planner breaks the work into steps, identifies dependencies, sequences
   the build (or defers to the human for approval)
4. **Dispatch** — the Dispatcher selects a coding agent (Claude, Codex, Gemini — agent-
   agnostic), constructs a rich context package, sets up the workspace (worktree, branch),
   and launches the agent
5. **Monitor** — while the agent works, specialist agents watch: Architect checks for
   drift, Reviewer examines output, Milestone Tracker validates progress
6. **Validate** — when the agent completes, deterministic checks run (drift, tests, lint),
   and the Reviewer does a final pass
7. **Correct** — if something's wrong, the orchestrator feeds corrections, additional
   context, or halts for human input
8. **Complete** — the Chronicler records what happened, the Scribe updates docs, the loop
   closes

### Why context management had to come first

The scaffold, context generation, drift detection, review pipeline, milestone validation —
these aren't just CLI tools. They're the **agent capabilities** of the specialized
oversight agents. When the orchestrator dispatches a coding agent:
- `telesis drift` becomes what the Architect runs continuously
- `telesis review` becomes what the Reviewer runs against the agent's output
- `telesis milestone check` becomes what the Milestone Tracker uses to validate progress
- `telesis context` becomes what the Scribe uses to keep docs current

The CLI was always the prototype for the agent layer.

### What makes this better than Symphony

Symphony dispatches coding agents too, but:
- **Context injection** — Symphony gives a prompt template with issue details. Telesis
  gives *everything it knows about the project*: spec, architecture decisions, what was
  tried before, conventions, dismissal history, the journal.
- **Active oversight** — Symphony fires and forgets (dispatch, wait, check result).
  Telesis has specialized agents watching *during* the work.
- **Agent-agnostic** — Symphony is coupled to Codex. Telesis treats the coding agent as a
  pluggable execution layer. The value is in the context and oversight, not the agent.
- **Memory across runs** — Symphony's agent starts fresh. Telesis's agent starts with
  "last time you worked on this module, here's what happened."

### The Dispatcher role

A new agent role emerges: **The Dispatcher** (or Foreman). Its job:
- Takes a unit of work + project context
- Selects the appropriate coding agent
- Constructs the context package (relevant docs, code, constraints, prior attempts)
- Sets up the workspace (worktree, branch, `.telesis/` config)
- Launches the agent with the right prompt and tool configuration
- Monitors the execution lifecycle (started, streaming, completed, failed)

This is distinct from the Planner (strategic sequencing) and the orchestrator (overall
coordination). The Dispatcher knows *how to talk to coding agents* — prompt construction,
tool configuration, protocol adaptation.

### Revised agent roster

| Agent | Role | Foundation |
|-------|------|-----------|
| **Reviewer** | Code quality, correctness, alignment | `telesis review` |
| **Architect** | Structural integrity, drift, ADR enforcement | `telesis drift` |
| **Spec Keeper** | Spec↔implementation alignment, spec evolution | — |
| **Milestone Tracker** | Progress validation, gate control | `telesis milestone` |
| **Chronicler** | Provenance trail, decision memory | `telesis note` |
| **Scribe** | Documentation currency | `telesis context` |
| **Test Sentinel** | Test validity, coverage meaning | — |
| **Planner** | Work breakdown, sequencing | Human-authored plans |
| **Dispatcher** | Agent selection, context packaging, workspace setup, execution lifecycle | — |

### Work intake patterns

Three intake channels, all converging on the same orchestration loop:

1. **Human via TUI** — "I want to add retry logic to the API client." The orchestrator
   may run a lightweight interview to clarify intent, check against the spec, then plan
   and dispatch.

2. **Issue tracker feed** — Jira/GitHub/Linear issues in a "ready" state get pulled in.
   The orchestrator enriches them with project context (which Symphony can't do because
   it has no project memory) before dispatching.

3. **Internal triggers** — drift detection finds a violation, milestone check finds
   unmet criteria, the Reviewer flags a pattern. These generate internal work items
   that the orchestrator can auto-dispatch (within autonomy boundaries) or surface
   to the human for approval.

### Open questions

1. ~~What protocol does the Dispatcher use?~~ **ACP. See next entry.**
2. How much autonomy does the orchestrator have? **Configurable. See next entry.**
3. Worktree/branch strategy for concurrent dispatches? **Default low concurrency
   (1-2). Judgment call per-project.**
4. ~~How does the human observe/intervene?~~ **ACP event stream + TUI. See next entry.**

---

## 2026-03-12 — ACP as the Dispatcher Protocol

### Decision: ACP (Agent Client Protocol) for coding agent communication

ACP is to coding agents what LSP is to language servers. It standardizes the protocol
so the Dispatcher doesn't need per-agent integration code.

**Why ACP over MCP or direct subprocess:**
- ACP is purpose-built for orchestrator↔coding-agent communication
- JSON-RPC over stdio (same transport as MCP/LSP)
- Session lifecycle: new, load, close, cancel — with crash recovery
- Structured output: tool calls, diffs, thinking (not ANSI scraping)
- Cooperative cancel (`session/cancel` → agent gracefully stops)
- Queue-based prompt submission (submit while busy, prompts drain in order)
- Multi-turn persistent sessions that survive across invocations

**Agent support (all via ACP, either native or adapter):**

| Agent | ACP Support | Adapter |
|-------|------------|---------|
| Claude Code | Adapter | `claude-agent-acp` (Zed Industries) |
| Codex | Adapter | `codex-acp` (Zed Industries) |
| Gemini | Native | `gemini --acp` |
| Cursor | Native | `cursor-agent acp` |
| GitHub Copilot | Native | `copilot --acp --stdio` |
| Pi | Adapter | `pi-acp` |
| Kiro | Native | `kiro-cli acp` |
| Qwen | Native | `qwen --acp` |

MCP goes the other direction — it's for agents to *use tools*, not for orchestrators to
*drive agents*. Some coding agents can act as MCP servers, but ACP is the fit-for-purpose
protocol for the Dispatcher's job.

### acpx as the integration layer

`acpx` (openclaw/acpx) is a headless CLI client for ACP that already solves the hard
problems:
- Agent adapter registry with auto-download (`npx`)
- Persistent sessions scoped to git roots
- Named parallel sessions (`-s backend`, `-s frontend`)
- NDJSON event output with stable envelope (sessionId, requestId, seq, type)
- Queue-based prompt submission with IPC
- Crash reconnect (dead process → respawn → session/load → resume)
- Permission controls (`--approve-all`, `--approve-reads`, `--deny-all`)

Integration options for telesis:
1. **Use `@agentclientprotocol/sdk` directly** — tightest integration, full control
2. **Use acpx as a library** — `npm install acpx`, call its session management
3. **Shell out to acpx** — subprocess, simplest MVP, good enough to start

### Live event streaming and TUI attachment

ACP's structured event stream solves the observation problem:

1. Daemon spawns coding agent via ACP, subscribes to NDJSON event stream
2. Events flow through the internal RxJS bus — specialist agents observe them
3. TUI connects to daemon, requests event stream for a session
4. Human sees: thinking, tool calls, diffs, completions — in real time
5. Human can intervene: `session/cancel` for cooperative stop, then redirect

The Architect observing the same event stream can detect drift *as tool calls happen*
— "the agent just edited src/github/client.ts, which violates the adapter boundary
in ADR-001" — before the agent finishes its turn.

### Autonomy configuration

```yaml
# .telesis/config.yml
orchestrator:
  autonomy: supervised    # supervised | autonomous | gated
  max_concurrent_agents: 2
  workspace_strategy: worktree  # worktree | copy
  default_agent: claude         # claude | codex | gemini | ...
```

- **supervised** — propose work and wait for human approval before dispatching
- **autonomous** — dispatch within milestone boundaries, surface results
- **gated** — autonomous but pause at defined gate states for human judgment

Default: supervised. Low concurrency (1-2) is the right starting point — merge
conflicts, resource contention, and cognitive overhead of tracking multiple concurrent
agents argue against high parallelism.

### Remaining open questions

1. How does the Dispatcher construct the ACP prompt? Does it inject telesis context
   as part of the prompt text, or does it configure the agent's CLAUDE.md / system
   instructions via the workspace setup?
2. Should the Dispatcher use acpx sessions directly, or should it manage its own
   session layer with ACP SDK underneath?
3. How do specialist agents (Reviewer, Architect) observe ACP events? Do they
   subscribe to the RxJS bus, or do they run as separate ACP-aware processes?
4. What's the workspace teardown policy? Keep worktrees for review? Auto-clean
   after merge? Configurable retention?

---
