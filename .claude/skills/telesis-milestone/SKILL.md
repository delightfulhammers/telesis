---
name: telesis-milestone
description: "Use when starting new work, creating milestones, writing TDDs, or completing milestones in a Telesis-managed project. Enforces the mandatory development process: milestone entry before coding, TDD for new subsystems, TDD-driven development, review convergence, and the full milestone completion workflow. Load this at the START of any implementation task and at the END before committing."
---

# Telesis Milestone — Process Discipline

**This process is mandatory. Do not skip steps.**

## Before Writing ANY Code

### 1. Create milestone entry
Add to `docs/MILESTONES.md` with status "In Progress":
- Goal (one sentence)
- What changes (paragraph)
- Acceptance criteria (numbered list)

### 2. Write TDD (if applicable)
Create `docs/tdd/TDD-NNN-slug.md` when the milestone introduces:
- A new package or directory with its own interface boundary
- Significant design decisions (containment patterns, protocol choices)

**Skip TDD for:** configuration changes, bug fixes, wiring existing pieces.

### 3. Plan the implementation
- Break into phases with a clear build order
- Identify dependencies between phases
- Get user approval before starting

## While Writing Code

### 4. Follow TDD (red/green/refactor)
- Write tests FIRST — verify they fail (red)
- Implement to make them pass (green)
- Refactor

### 5. After EVERY code change
```bash
pnpm run format     # Formatter
pnpm run lint       # Type checking
pnpm test           # All tests pass
pnpm run build      # Compiles both binaries
telesis drift       # Zero errors
```

## Before Committing

### 6. Review to convergence
```bash
git add <files>
telesis review
# Fix findings → re-stage → re-review until converged
```

### 7. Fix ALL small review findings
Especially security. Only defer findings that are genuinely large AND unrelated.

## Milestone Completion (MANDATORY — every step)

### 8. Version bump
- `package.json` version field
- `src/version.ts` VERSION constant (must match)

### 9. Documentation updates
- `docs/MILESTONES.md` — set status to Complete
- TDD status → Accepted (if applicable)
- `docs/PRD.md` — add/update command docs
- `docs/ARCHITECTURE.md` — add new files/modules
- `docs/user-guide/` — update relevant pages

### 10. Regenerate and verify
```bash
telesis context        # Regenerate CLAUDE.md
telesis drift          # Must pass with zero errors
```

### 11. Ship
```bash
git add <all changes>
git commit -m "..."
git tag vX.Y.Z
git push
git push origin vX.Y.Z
```
CI will build and publish the release automatically on tag push.

## Why Steps Get Skipped (and why that's a problem)

| Skipped Step | Consequence |
|-------------|-------------|
| No milestone entry | Drift check fails, version consistency breaks |
| No TDD | Design decisions undocumented, future agents lack context |
| Tests after code | Bugs slip through, implementation drives the design instead of tests |
| No review convergence | Security issues and architecture violations ship |
| No milestone completion | Docs stale, version wrong, CLAUDE.md outdated |
| No drift check | Spec-implementation divergence accumulates silently |
