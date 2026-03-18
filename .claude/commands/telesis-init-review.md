# Telesis Init Review — Post-Init Doc Validation

You are validating generated documents after `telesis init` on an existing project.

## Why This Matters

`telesis init` uses an AI interview to generate VISION.md, PRD.md, ARCHITECTURE.md, and MILESTONES.md. When run on an existing codebase, the generated docs may contain hallucinated structure, incorrect assumptions, or missing operational context. Systematic validation is essential.

## Validation Checklist

### ARCHITECTURE.md
- [ ] **Repository structure** matches actual `ls`/`find` output — no fabricated directories
- [ ] **Dependencies** list matches actual package manifest (package.json, go.mod, etc.)
- [ ] **Subsystem descriptions** reflect real code, not inferred concepts
- [ ] **Statelessness/storage claims** verified against actual persistence (databases, files, caches)
- [ ] **Module boundaries** match actual import graph

### PRD.md
- [ ] **Commands** listed actually exist and work
- [ ] **User journeys** match real workflows
- [ ] **Scope boundaries** (out-of-scope items) are accurate
- [ ] **Requirements** reflect what the software actually does, not aspirations

### MILESTONES.md
- [ ] **Milestone history** aligns with actual release history
- [ ] **Current milestone** is accurate
- [ ] **Acceptance criteria** are verifiable

### VISION.md
- [ ] **Problem statement** matches the actual problem being solved
- [ ] **Design principles** reflect real architectural choices, not generic platitudes

## Recovering Lost CLAUDE.md Content

If `telesis init` overwrote an existing CLAUDE.md:

```bash
# View the old content
git show HEAD~1:CLAUDE.md

# Or diff to see what was lost
git diff HEAD~1:CLAUDE.md CLAUDE.md
```

For content not captured in the generated docs, create notes:
```bash
telesis note add -t rules "Always use snake_case for database columns"
telesis note add -t pitfalls "The cache TTL must be set before the first request"
telesis context   # Regenerate CLAUDE.md with notes included
```

As of v0.27.3, `telesis init` automatically preserves existing CLAUDE.md sections as notes tagged `preserved-claude-md`. Check these after init:
```bash
telesis note list -t preserved-claude-md
```

## Common Hallucination Patterns

1. **Fabricated directory structure** — especially `internal/` packages that don't exist
2. **False statelessness claims** — project may have SQLite, Redis, or file-based state
3. **Inferred naming conventions** — generated names for packages/modules that don't match reality
4. **Over-scoped architecture** — describing microservices when the project is a monolith
5. **Missing dependencies** — especially transitive or build-time dependencies

## Workflow After Validation

```bash
# 1. Fix docs manually
# 2. Create notes for operational content
telesis note add -t rules "..."
# 3. Regenerate context
telesis context
# 4. Verify drift
telesis drift
```
