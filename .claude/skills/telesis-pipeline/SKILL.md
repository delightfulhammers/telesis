---
name: telesis-pipeline
description: "Use when working in a project managed by Telesis (.telesis/config.yml exists). Provides the canonical lifecycle order for all development work: intake, planning, dispatch, quality gates, review convergence, milestone completion. Load this when starting any task, committing code, or when the user asks about the telesis workflow."
---

# Telesis Pipeline — Full Lifecycle Orchestration

This project is managed by Telesis. Follow this canonical lifecycle for all work.

## Pipeline Order

```
intake → triage → milestone setup → plan → approve → dispatch → quality gates → review convergence → milestone check → milestone complete → commit → tag → push
```

## Key Commands

### Intake
```bash
telesis intake github                    # Import issues from GitHub
telesis intake list                      # List pending work items
telesis intake show <id>                 # Show work item details
```
Note: `intake github` needs GITHUB_TOKEN. Telesis checks `gh auth token` automatically.

### Planning
```bash
telesis intake approve --plan <id>       # Approve work item + create plan
telesis plan show <id>                   # Review the generated plan
telesis plan approve <id>                # Approve the plan for execution
```

### Dispatch
```bash
telesis dispatch run "<task>" --agent claude   # Dispatch coding agent
telesis dispatch show <id>                     # Check session results
telesis dispatch show <id> --text              # Compact narrative view
```

### Review (pre-push, MANDATORY)
```bash
git add <files>                          # MUST stage before review
telesis review                           # Multi-persona review (staged changes)
telesis review --ref main                # Review against main branch
```
**Critical:** Always stage changes before reviewing. Unstaged changes produce stale reviews.

Review until convergence — run review, fix findings, re-stage, review again. Continue until findings stabilize (new + persistent ≤ 3, severity ≤ medium).

### Quality Gates
```bash
pnpm run format                          # Format
pnpm run lint                            # Type check
pnpm test                                # All tests pass
pnpm run build                           # Compiles
telesis drift                            # Zero errors
```

### Milestone Completion (MANDATORY — do not skip any step)
1. Bump version in `package.json` AND `src/version.ts`
2. Update `docs/MILESTONES.md` — set status to Complete
3. Update TDD status to Accepted (if applicable)
4. Update `docs/PRD.md` with new commands
5. Update `docs/ARCHITECTURE.md` with new files
6. Update user guide (`docs/user-guide/`)
7. Run `telesis context` to regenerate CLAUDE.md
8. Commit, tag, push

### Orchestrator (automated lifecycle)
```bash
telesis orchestrator run                 # Advance state machine
telesis orchestrator status              # Current state + pending decisions
telesis orchestrator approve <id>        # Approve a decision
telesis orchestrator preflight           # Pre-commit checks
```

## MCP Tools vs CLI

Most operations are available as MCP tools (`telesis_intake_list`, `telesis_review`, etc.). Use MCP tools when available. For long-running operations that may exceed MCP timeout, fall back to CLI.

## Common Mistakes

1. **Don't skip review.** Always review before pushing, always converge.
2. **Stage before reviewing.** `git add` then `telesis review`. Unstaged = stale.
3. **Don't forget milestone completion.** Version bump, doc updates, context regen — all of it.
4. **Don't commit without drift check.** `telesis drift` catches spec-implementation divergence.
5. **Create milestone + TDD before coding.** Not after.
