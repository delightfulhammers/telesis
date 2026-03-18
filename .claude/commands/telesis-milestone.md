# Telesis Milestone — Process Discipline

You are working on a Telesis-managed project. Follow this process for every piece of work. **Do not skip steps.**

## Before Writing Code

1. **Create milestone entry** in `docs/MILESTONES.md` (status: In Progress)
   - Define the goal, what changes, acceptance criteria
   - If the milestone introduces a new package/subsystem, write a TDD first

2. **Write TDD** (if applicable) in `docs/tdd/TDD-NNN-slug.md`
   - Status: Draft → Accepted when implementation matches
   - Required for: new packages, new interface boundaries, significant design decisions
   - Skip for: configuration changes, bug fixes, wiring existing pieces

3. **Plan the implementation** before starting
   - Break into phases with a clear build order
   - Identify dependencies between phases

## While Writing Code

4. **Follow TDD (red/green/refactor)**
   - Write tests FIRST, verify they fail
   - Implement to make them pass
   - Refactor

5. **After every code change, run the checklist:**
   ```bash
   pnpm run format     # Formatter
   pnpm run lint       # Type checking
   pnpm test           # All tests pass
   pnpm run build      # Compiles both binaries
   telesis drift       # Zero errors
   ```

## Before Committing

6. **Stage and review to convergence**
   ```bash
   git add <files>
   telesis review
   # Fix findings, re-stage, re-review until converged
   ```

7. **Fix ALL small findings from review** — especially security. Only defer findings that are genuinely large and unrelated to current work.

## Milestone Completion (mandatory, do not skip)

8. **Bump version** in `package.json` AND `src/version.ts`
9. **Update `docs/MILESTONES.md`** — set status to Complete
10. **Update TDD status** to Accepted (if applicable)
11. **Update `docs/PRD.md`** — add/update command documentation
12. **Update `docs/ARCHITECTURE.md`** — add new files/modules
13. **Update user guide** (`docs/user-guide/`) with new features
14. **Run `telesis context`** to regenerate CLAUDE.md
15. **Commit, tag, push**
16. **Run `./scripts/release.sh`** or let CI build the release

## What Goes Wrong When Steps Are Skipped

- No milestone entry → drift check can't validate, version consistency fails
- No TDD → design decisions are undocumented, future sessions lack context
- Tests after code → bugs slip through, coverage gaps accumulate
- No review convergence → security issues, architecture violations ship
- No milestone completion → docs are stale, version is wrong, CLAUDE.md is outdated
