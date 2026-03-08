## Working Conventions

**Language and runtime:**
- Go. Minimum version in `go.mod`. Single static binary output.
- `cobra` for CLI. `go:embed` for templates. Minimize dependencies.

**Package discipline:**
- `cmd/telesis/` contains only the entry point. A single `main.go` that calls `cli.Execute()`.
- `internal/cli/` contains Cobra command wiring — flag parsing, calling into business logic packages, printing output. This is the only package that imports Cobra.
- `internal/{config,context,scaffold,adr,tdd,status}` contain business logic. They know nothing about the CLI framework.
- Nothing in `internal/` imports from `cmd/`.
- `templates/` is embedded at compile time via `go:embed`. No runtime file I/O for templates.

**Error handling:**
- Business logic packages (`internal/`) return errors. They never call `log.Fatal` or `os.Exit`.
- CLI commands (`internal/cli/`) catch errors and handle exit behavior.
- User-facing error messages are actionable: "run `telesis init` first", not "config not found".

**Testing:**
- Unit tests for all `internal/` packages. Table-driven where applicable.
- Integration tests for CLI commands against temp directories.
- Don't test Cobra wiring — test the underlying business logic functions.
- All tests operate on temp directories to avoid polluting the real filesystem.

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
