# Telesis Review — Convergence Loop

You are running a code review convergence loop using Telesis.

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
- **Findings**: Each has severity (critical/high/medium/low), category, path, description, suggestion
- **Convergence**: "Round N: X new Y persistent Z resolved" — track the trend
- **Converged when**: new + persistent findings ≤ 3, all severity ≤ medium
- **Exit code 1**: Critical or high findings present

### 4. Fix findings
- Address high/critical findings first
- Medium findings: fix if the fix is small, defer if large and unrelated
- Low findings: fix if trivial, otherwise note and move on
- **Never dismiss security findings that are trivially fixable**

### 5. Re-stage and re-review
```bash
git add <fixed files>       # Stage the fixes
telesis review              # Review again — should show findings resolved
```

### 6. Repeat until converged
Continue the loop until the review reports convergence or findings are all low/medium with no actionable fixes remaining.

## Common Patterns

**False positives that recur across rounds**: If the same finding persists after being addressed, it may be a review limitation. Document why it's acceptable and move on.

**Architecture findings**: These are often about code organization preferences. Fix if the suggestion is clearly better; document the chosen approach if it's a legitimate design decision.

**Security findings**: Always fix. Even if the threat is theoretical, if the fix is small, do it now. Only defer security findings when the scope is genuinely large and unrelated.

## Review Modes

```bash
telesis review --single          # Single-pass (faster, cheaper, less thorough)
telesis review --personas sec,arch  # Specific personas only
telesis review --no-verify       # Skip full-file verification pass
```
