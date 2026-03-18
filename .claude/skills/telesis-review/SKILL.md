---
name: telesis-review
description: "Use when about to commit, push, or when code changes need review in a Telesis-managed project. Provides the review convergence loop: stage, review, fix findings, re-stage, re-review until converged. Load this before any git commit or push, or when the user mentions code review."
---

# Telesis Review — Convergence Loop

## The Loop

```
stage → review → findings? → fix → re-stage → review → converged? → done
```

## Steps

### 1. Stage changes
```bash
git add <specific files>    # Stage the files to review
```
**Never skip this.** Reviewing unstaged changes produces stale results.

### 2. Run review
```bash
telesis review              # Review staged changes
telesis review --ref main   # Review against a branch
telesis review --json       # Machine-readable output
```

### 3. Interpret results
- **Findings**: severity (critical/high/medium/low), category, path, description, suggestion
- **Convergence**: "Round N: X new Y persistent Z resolved"
- **Converged when**: new + persistent findings ≤ 3, all severity ≤ medium
- **Exit code 1**: Critical or high findings present

### 4. Fix findings
- Address high/critical findings first
- Medium: fix if the fix is small, defer only if large and unrelated
- Low: fix if trivial
- **ALWAYS fix security findings that are trivially fixable** — never defer small security fixes

### 5. Re-stage and re-review
```bash
git add <fixed files>       # Stage the fixes
telesis review              # Review again — should show resolved findings
```

### 6. Repeat until converged

## Important Rules

- **Stage before every review round.** New fixes must be staged or the review sees stale code.
- **Fix small findings immediately.** Don't dismiss review findings as "out of scope" when the fix is trivial. Leave the code better than you found it.
- **Security findings are never optional.** If the fix is small, do it now regardless of scope.
- **Architecture findings are judgment calls.** Fix if clearly better; document if it's a legitimate design choice.
- **False positives that persist across rounds**: Note them and move on after 2-3 rounds of the same finding.
