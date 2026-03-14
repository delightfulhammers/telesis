---
title: Work Intake & Planning
description: Importing work items and decomposing them into executable plans
weight: 70
---

# Work Intake & Planning

Telesis can import work items from external sources (currently GitHub Issues), decompose them into sequenced task plans, and dispatch agents to execute them. This is the planning loop — the bridge between "what needs to be done" and "an agent is doing it."

## Work Intake

### Importing from GitHub

```bash
telesis intake github
```

This fetches open issues from your configured GitHub repository and imports them as work items. It requires `GITHUB_TOKEN` to be set.

Each imported issue becomes a work item stored in `.telesis/intake/`. Telesis deduplicates against existing items, so running `intake github` multiple times is safe — it only imports new issues.

After import, Telesis reports how many items were imported, how many were skipped (already exists), and any errors.

### Filtering Imports

Configure which issues to import in `.telesis/config.yml`:

```yaml
intake:
  github:
    labels: ["bug", "feature"]      # Only import issues with these labels
    excludeLabels: ["wontfix"]      # Skip issues with these labels
    assignee: "your-username"       # Only your assigned issues
    state: "open"                   # open, closed, or all
```

### Listing Work Items

```bash
telesis intake list
```

By default, this shows active items (pending, approved, dispatching). To see everything including completed and skipped items:

```bash
telesis intake list --all
```

### Viewing a Work Item

```bash
telesis intake show <id>
```

The ID can be a prefix — Telesis matches the shortest unique prefix.

### Work Item Lifecycle

Work items follow a defined lifecycle:

```
pending → approved → dispatching → completed
                                 → failed
         → skipped
```

- **Pending** — imported but not yet triaged
- **Approved** — ready for planning or dispatch
- **Dispatching** — an agent is working on it
- **Completed** — work is done
- **Failed** — agent encountered an unrecoverable error
- **Skipped** — explicitly marked as not worth doing

### Approving and Skipping

Approve a work item (and optionally dispatch it immediately):

```bash
telesis intake approve <id>
telesis intake approve <id> --agent claude
telesis intake approve <id> --plan      # Create a plan instead of dispatching directly
```

Skip a work item:

```bash
telesis intake skip <id>
```

## Planning

Planning decomposes a work item into a sequenced set of tasks with dependencies. The planner agent analyzes the work item against your project's architecture, conventions, and current state, then produces a task graph.

### Creating a Plan

```bash
telesis plan create <work-item-id>
```

This calls the planner agent, which reads your project context (VISION, ARCHITECTURE, conventions, active milestone) and produces a plan with:

- A set of tasks, each with a title, description, and acceptance criteria
- A dependency graph (tasks declare which other tasks they depend on)
- A topological ordering (validated with Kahn's algorithm to ensure no cycles)

Plans start in `draft` status.

### Viewing Plans

List all active plans:

```bash
telesis plan list
telesis plan list --all    # Include completed plans
```

View a specific plan's tasks and dependency graph:

```bash
telesis plan show <plan-id>
```

### Plan Lifecycle

```
draft → approved → executing → completed
                             → failed
                             → escalated
                             → awaiting_gate
```

- **Draft** — created but not yet approved for execution
- **Approved** — ready to execute
- **Executing** — tasks are being dispatched sequentially
- **Completed** — all tasks finished successfully
- **Failed** — a task failed after all retries
- **Escalated** — a task was escalated for human review
- **Awaiting gate** — all tasks completed, waiting for human approval (when gates are enabled)

### Approving a Plan

```bash
telesis plan approve <plan-id>
```

This transitions the plan from `draft` to `approved`, making it eligible for execution.

### Executing a Plan

```bash
telesis plan execute <plan-id>
telesis plan execute <plan-id> --agent claude
telesis plan execute <plan-id> --no-validate
```

Execution dispatches tasks sequentially, respecting the dependency graph. After each task completes, the validation agent checks the output against the task's acceptance criteria. If validation fails, the task is retried (up to the configured max retries). If retries are exhausted, the task is escalated for human review.

The `--no-validate` flag skips post-task validation. Use this when you want faster execution at the cost of automated quality checks.

### Handling Failures

When a task is escalated (failed after all retries), you have two options:

**Retry the plan from the failed task:**

```bash
telesis plan retry <plan-id>
```

This re-executes starting from the escalated/failed task. Completed tasks are skipped.

**Skip the failed task and continue:**

```bash
telesis plan skip-task <plan-id> <task-id>
```

This marks the task as skipped and resumes execution with the next task in the dependency graph.

### Validation Gates

When `validation.enableGates` is set to `true` in your config, plan execution pauses after all tasks are completed and waits for explicit approval:

```bash
telesis plan gate-approve <plan-id>
```

This transitions the plan from `awaiting_gate` to `completed`. Gates are useful when you want to inspect the agent's work before it's committed.

### Task Lifecycle

Individual tasks within a plan follow their own lifecycle:

```
pending → running → completed
                  → failed → (retry) → running
                  → validating → completed
                               → correcting → running
                               → escalated
         → skipped
```

## Planning Configuration

```yaml
planner:
  model: claude-sonnet-4-6     # Model used for plan decomposition
  maxTasks: 20                  # Maximum tasks per plan

validation:
  model: claude-sonnet-4-6     # Model used for task validation
  maxRetries: 3                 # Retry attempts before escalation
  enableGates: false            # Require human approval after plan completion
```

## Combining Intake and Planning

A typical workflow:

```bash
# Import new issues
telesis intake github

# Review what came in
telesis intake list

# Approve a work item and create a plan
telesis intake approve <id> --plan

# Review the plan
telesis plan show <plan-id>

# Approve and execute
telesis plan approve <plan-id>
telesis plan execute <plan-id>
```

Or, for the fully orchestrated version, use `telesis run` — see [The Full Pipeline]({{< relref "pipeline" >}}).
