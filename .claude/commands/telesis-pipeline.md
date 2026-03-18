# Telesis Pipeline — Full Lifecycle Orchestration

You are assisting with a project managed by Telesis. Follow this canonical lifecycle for all work.

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

### Review (pre-push)
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

### Milestone Completion
```bash
# 1. Bump version in package.json AND src/version.ts
# 2. Update MILESTONES.md status to Complete
# 3. Update TDD status to Accepted (if applicable)
# 4. Update PRD.md with new commands
# 5. Update ARCHITECTURE.md with new files
# 6. Update user guide
# 7. telesis context (regenerate CLAUDE.md)
# 8. Commit, tag, push
```

### Orchestrator (automated lifecycle)
```bash
telesis orchestrator run                 # Advance state machine
telesis orchestrator status              # Current state + pending decisions
telesis orchestrator approve <id>        # Approve a decision
telesis orchestrator reject <id> --reason "..."
telesis orchestrator preflight           # Pre-commit checks
```

## MCP Tools vs CLI

Most operations are available as MCP tools (`telesis_intake_list`, `telesis_review`, etc.). For write operations that require long-running processes:
- `telesis_dispatch_run` — available via MCP (10min timeout)
- `telesis_intake_github` — available via MCP
- For anything that exceeds MCP limits, fall back to CLI

## Common Mistakes to Avoid

1. **Don't skip review.** Always review before pushing, always converge.
2. **Stage before reviewing.** `git add` then `telesis review`. Unstaged = stale.
3. **Don't forget milestone completion.** Version bump, doc updates, context regen — all of it.
4. **Don't commit without drift check.** `telesis drift` catches spec-implementation divergence.
5. **Create milestone + TDD before coding.** Not after.
