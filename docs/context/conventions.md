## Working Conventions

---

### Go (CLI layer)

**Language and runtime:**
- Go. Minimum version in `go.mod`. Single static binary output.
- `cobra` for CLI. `go:embed` for templates. Minimize dependencies.

**Package discipline:**
- `cmd/telesis/` contains only the entry point. A single `main.go` that calls `cli.Execute()`.
- `internal/cli/` contains Cobra command wiring — flag parsing, calling into business logic
  packages, printing output. This is the only package that imports Cobra.
- `internal/{config,context,scaffold,adr,tdd,status}` contain business logic. They know
  nothing about the CLI framework.
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

---

### TypeScript (agent layer)

**Language and runtime:**
- TypeScript targeting Node.js LTS (22.x). ESM modules.
- `pnpm` for package management.
- `tsx` for development execution (`pnpm tsx src/index.ts`).
- `tsc` for production builds. Output to `dist/`.

**Package discipline:**
- `model/client.ts` is the only file that imports `@anthropic-ai/sdk` directly. All other
  code calls `ModelClient`. This is a hard rule — it keeps provider coupling contained.
- `telemetry/` is wired at construction time. Callers never explicitly log — the
  `ModelClient` handles it transparently.
- Agent packages (`interview/`, `generate/`, `telemetry/`) know nothing about the CLI
  entrypoint. `index.ts` wires them together.
- No package in `agent/src/` imports from the Go layer. The shared interface is the
  filesystem (`.telesis/`, `docs/`).

**Model calls:**
- All model calls go through `ModelClient`. Never call the Anthropic SDK directly from
  business logic.
- Default model: `claude-sonnet-4-20250514` for both interview and generation.
  Configurable in `.telesis/config.yml`.
- Every model call is logged to `.telesis/telemetry.jsonl` automatically via `ModelClient`.
  This is not optional.

**Telemetry:**
- Token counts are logged for every model call. Cost is never stored — it is derived at
  display time from tokens + `.telesis/pricing.yml`.
- Telemetry write failures log to stderr and do not abort the operation.
- `.telesis/pricing.yml` is owned by the agent layer. The Go CLI reads it but does not
  write it.

**Error handling:**
- Model call failures: retry once with exponential backoff, then throw with the raw API
  response attached. Never silently swallow API errors.
- Partial generation failures: write successfully generated documents, report the failure
  clearly. Do not leave the filesystem in an ambiguous state.
- Use typed errors where the caller needs to distinguish failure modes. Use plain `Error`
  for everything else.

**Testing:**
- Unit tests for `model/`, `telemetry/`, `config/`, `generate/` using `vitest`.
- Integration tests for interview engine and document generator use recorded fixtures,
  not live model calls. Fast and deterministic by default.
- Live model call tests are in a separate `tests/live/` directory, tagged, and run
  explicitly (`pnpm test:live`). Never run in CI by default.
- Test files colocated with source: `client.ts` → `client.test.ts`.

**Code style:**
- Strict TypeScript (`"strict": true` in tsconfig). No `any` without a comment explaining
  why.
- Prefer `interface` over `type` for object shapes. Use `type` for unions and aliases.
- No default exports except at `index.ts` entrypoints. Named exports everywhere else.
- Async/await throughout. No raw Promise chains.

---

### Shared conventions (both layers)

**ADR discipline:**
- Significant architectural decisions get an ADR. When in doubt, write one.
- ADR status: `Proposed` → `Accepted` → `Superseded`.
- ADRs are immutable once Accepted; supersede rather than edit.

**PR expectations:**
- Bop will review every PR. Write code as if a multi-perspective panel is reading it.
- PRs should be focused. One concern per PR where possible.
- PR descriptions reference the relevant ADR or TDD when applicable.

**Scope discipline:**
- If something is not in the current milestone's acceptance criteria, it is out of scope.
  Name it and park it; don't let it creep in.
- Current out of scope: drift detection, milestone validation automation, swarm
  orchestration, GitHub/Linear/Jira integrations, ACP server, web UI, multi-project
  management, auth/teams, OpenClaw TUI integration.