## Additional Conventions

**Language and runtime:**
- Go. Minimum version in `go.mod`. Single static binary output.
- `cobra` for CLI. `go:embed` for templates. Minimize dependencies.

**File generation:**
- All generated files use `go:embed` templates in `templates/`.
- `telesis context` is always idempotent — safe to run repeatedly.
- Generated files include a header noting they are generated and how to regenerate.

**ADR discipline:**
- Significant architectural decisions get an ADR. When in doubt, write one.
- ADR status: `Proposed` → `Accepted` → `Superseded`.
- ADRs are immutable once Accepted; supersede rather than edit.

**PR expectations:**
- Bop will review every PR. Write code as if a multi-perspective panel is reading it.
- PRs should be focused. One concern per PR where possible.
- PR descriptions reference the relevant ADR or TDD when applicable.

**Scope discipline:**
- If something is not in the MVP done criteria, it is out of scope. Name it and park it; don't let it creep in.
- Out of scope for MVP: drift detection, milestone validation automation, swarm orchestration, GitHub/Linear/Jira integrations, ACP server, web UI, multi-project management, auth/teams.
