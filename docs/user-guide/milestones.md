---
title: Milestones
description: Validation gates and milestone lifecycle
weight: 90
---

# Milestones

Milestones are development checkpoints with explicit acceptance criteria. They define what "done" looks like for each phase of your project. Telesis uses milestones to scope work, validate progress, and control gates.

## Milestone Structure

Each milestone in `docs/MILESTONES.md` has:

- **Version** — a semver version (e.g., v0.5.0)
- **Goal** — a one-sentence description of what the milestone achieves
- **Status** — `Planned`, `Active`, or `Complete`
- **Acceptance criteria** — numbered, explicit conditions that must be true for the milestone to be done
- **Build sequence** — an ordered list of implementation phases (optional but recommended)
- **TDD reference** — a link to the Technical Design Document, if applicable

## Checking Milestone Readiness

Before marking a milestone complete, verify it's ready:

```bash
telesis milestone check
```

This runs a validation suite:

1. **Drift detection** — runs `telesis drift` and checks for zero errors
2. **Tests** — runs the project's test suite
3. **Build** — verifies the project compiles
4. **Lint** — runs type checking
5. **Acceptance criteria** — lists each criterion for manual confirmation

The command exits 1 on any automated failure. Acceptance criteria are displayed for you to verify manually — Telesis can check structural requirements automatically, but whether a feature "works correctly" requires human judgment.

## Completing a Milestone

```bash
telesis milestone complete
```

This automates the mechanical steps of milestone completion:

1. Sets the milestone status to `Complete` in `docs/MILESTONES.md`
2. Bumps the `version` field in `package.json` to the milestone version
3. Updates referenced TDD statuses to `Accepted`
4. Regenerates `CLAUDE.md` with the updated project state

After completion, Telesis prompts you for the remaining manual steps:

- Update `docs/PRD.md` with documentation for new CLI features
- Update `docs/ARCHITECTURE.md` with new modules and file structure
- Commit the changes
- Tag the release (`git tag v0.X.0 && git push origin v0.X.0`)

## Milestone Workflow

The full milestone workflow:

```bash
# Work on the milestone...

# Check readiness
telesis milestone check

# Fix any issues, then check again
telesis milestone check

# When everything passes, complete
telesis milestone complete

# Manual follow-up: update PRD, ARCHITECTURE, commit, tag
```

## Scope Discipline

Milestones enforce scope discipline. If something isn't in the current milestone's acceptance criteria, it's out of scope. Name it, park it (as a note or a future milestone), and don't let it creep in.

This is particularly important when using autonomous agents. Agents will happily gold-plate, refactor adjacent code, and add "nice to have" features unless the scope is explicitly bounded. Milestones provide that boundary.
