## Working Conventions

---

### TypeScript / Bun

**Language and runtime:**
- TypeScript, compiled to a single static binary with `bun build --compile`.
- `pnpm` for package management.
- `bun run src/index.ts` for development execution.
- ESM modules throughout.

**Package discipline:**
- `src/cli/` contains Commander command definitions — flag parsing, calling into business
  logic packages, printing output. This is the only directory that imports Commander.
- `src/{config,context,scaffold,adr,tdd,status,milestones,docgen}` contain business logic.
  They know nothing about the CLI framework.
- `src/agent/model/client.ts` is the only file that imports `@anthropic-ai/sdk` directly.
  All other code calls `ModelClient`. This is a hard rule — it keeps provider coupling
  contained.
- `src/agent/` packages (`interview/`, `generate/`, `telemetry/`) know nothing about the
  CLI entrypoint. `src/cli/init.ts` wires them together.
- `src/templates/` contains Mustache templates imported at build time via Bun file imports.

**Model calls:**
- All model calls go through `ModelClient`. Never call the Anthropic SDK directly from
  business logic.
- Default model: `claude-sonnet-4-6` for both interview and generation.
  Configurable in `.telesis/config.yml`.
- Every model call is logged to `.telesis/telemetry.jsonl` automatically via `ModelClient`.
  This is not optional.

**Telemetry:**
- Token counts are logged for every model call. Cost is never stored — it is derived at
  display time from tokens + `.telesis/pricing.yml`.
- Telemetry write failures log to stderr and do not abort the operation.

**Error handling:**
- Business logic packages return errors or throw. They never call `process.exit`.
- CLI commands catch errors via `handleAction` and handle exit behavior.
- User-facing error messages are actionable: "run `telesis init` first", not "config not found".
- Model call failures: retry once with exponential backoff, then throw with the raw API
  response attached. Never silently swallow API errors.
- Partial generation failures: write successfully generated documents, report the failure
  clearly. Do not leave the filesystem in an ambiguous state.
- Use typed errors where the caller needs to distinguish failure modes. Use plain `Error`
  for everything else.

**Testing:**
- Unit tests for all `src/` packages using `vitest`.
- Test files colocated with source: `config.ts` → `config.test.ts`.
- All tests operate on temp directories to avoid polluting the real filesystem.
- Integration tests for interview engine and document generator use recorded fixtures,
  not live model calls. Fast and deterministic by default.
- Live model call tests are in a separate `tests/live/` directory, tagged, and run
  explicitly (`pnpm test:live`). Never run in CI by default.

**Code style:**
- Strict TypeScript (`"strict": true` in tsconfig). No `any` without a comment explaining
  why.
- Prefer `interface` over `type` for object shapes. Use `type` for unions and aliases.
- No default exports except at `index.ts` entrypoints. Named exports everywhere else.
- Async/await throughout. No raw Promise chains.

**File generation:**
- All generated files use Mustache templates in `src/templates/`.
- `telesis context` is always idempotent — safe to run repeatedly.
- Generated files include a header noting they are generated and how to regenerate.

---

### TDD discipline

- Any milestone that introduces a **new package or subsystem** with its own interface
  boundary should have a TDD.
- Any milestone with **significant design decisions** (containment patterns, retry
  strategies, protocol choices, adapter layering) should have a TDD.
- Pure workflow/configuration milestones (wiring existing pieces) may skip a TDD.
- TDDs should be written **before implementation** when possible, to serve as a design
  contract. When written retroactively, they still document the rationale and scope
  boundary — set status directly to "Accepted".
- TDD status: `Draft` → `Accepted`. A TDD is Accepted when the implementation matches
  the design. Superseded TDDs should reference their replacement.

### ADR discipline

- Significant architectural decisions get an ADR. When in doubt, write one.
- ADR status: `Proposed` → `Accepted` → `Superseded`.
- ADRs are immutable once Accepted; supersede rather than edit.

### PR expectations

- Write code as if a multi-perspective review panel is reading it.
- PRs should be focused. One concern per PR where possible.
- PR descriptions reference the relevant ADR or TDD when applicable.

### Scope discipline

- If something is not in the current milestone's acceptance criteria, it is out of scope.
  Name it and park it; don't let it creep in.
- Current out of scope: swarm orchestration, GitHub/Linear/Jira integrations, web UI,
  multi-project management, auth/teams, OpenClaw TUI integration.

### Milestone workflow

These steps are **mandatory** after completing a milestone. Do not skip them.

1. Bump `version` in `package.json` to the milestone version
2. Update `docs/MILESTONES.md` — set milestone status to "Complete"
3. Update the relevant TDD status to "Accepted" (if applicable)
4. Update `docs/PRD.md` — add/update command documentation for new CLI features
5. Update `docs/ARCHITECTURE.md` — add new files/modules to the repo structure
6. Run `telesis context` to regenerate `CLAUDE.md`
7. Commit and push the doc updates
8. Tag the release (e.g., `git tag v0.X.0` + `git push origin v0.X.0`)

### Post-code-change checklist

After every code change:

1. Run `pnpm run format` (formatter)
2. Run `pnpm run lint` (type checking)
3. Run `pnpm test` (all tests pass)
4. Run `pnpm run build` (compiles)
5. Run `telesis drift` (zero errors)
6. If docs were changed, run `telesis context` to regenerate `CLAUDE.md`
