---
name: telesis-init-review
description: "Use immediately after running telesis init on an existing project, or when the user asks to validate generated documentation. Provides a systematic checklist for verifying ARCHITECTURE.md, PRD.md, MILESTONES.md, and VISION.md against the actual codebase, plus guidance for recovering content from a pre-existing CLAUDE.md."
---

# Telesis Init Review — Post-Init Doc Validation

Use this after `telesis init` on an existing codebase. The generated docs may contain hallucinated structure or incorrect assumptions.

## Validation Checklist

### ARCHITECTURE.md
- [ ] Repository structure matches actual `ls`/`find` output — no fabricated directories
- [ ] Dependencies list matches actual package manifest
- [ ] Subsystem descriptions reflect real code, not inferred concepts
- [ ] Statelessness/storage claims verified (check for databases, caches, file-based state)
- [ ] Module boundaries match actual import graph

### PRD.md
- [ ] Commands listed actually exist and work
- [ ] User journeys match real workflows
- [ ] Scope boundaries are accurate
- [ ] Requirements reflect what the software actually does

### MILESTONES.md
- [ ] Milestone history aligns with actual release history
- [ ] Current milestone is accurate
- [ ] Acceptance criteria are verifiable

### VISION.md
- [ ] Problem statement matches the actual problem
- [ ] Design principles reflect real architectural choices

## Recovering Lost CLAUDE.md Content

As of v0.27.3, `telesis init` automatically preserves existing CLAUDE.md sections as notes:
```bash
telesis note list -t preserved-claude-md    # Check preserved content
```

If that didn't capture everything, recover manually:
```bash
git show HEAD~1:CLAUDE.md                   # View the old content
git diff HEAD~1:CLAUDE.md CLAUDE.md         # See what changed
```

Create notes for operational content not captured in generated docs:
```bash
telesis note add -t rules "Always use snake_case for database columns"
telesis context                              # Regenerate CLAUDE.md with notes
```

## Common Hallucination Patterns

1. **Fabricated directory structure** — especially `internal/` packages that don't exist
2. **False statelessness claims** — project may have SQLite, Redis, or file-based state
3. **Inferred naming conventions** — generated names that don't match reality
4. **Over-scoped architecture** — describing microservices when it's a monolith
5. **Missing dependencies** — especially transitive or build-time deps

## Workflow After Validation

```bash
# 1. Fix docs to match reality
# 2. Create notes for operational content
telesis note add -t rules "..."
# 3. Regenerate context
telesis context
# 4. Verify drift
telesis drift
```
