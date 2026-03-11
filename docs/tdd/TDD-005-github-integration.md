# TDD-005 — GitHub Integration

**Status:** Accepted
**Date:** 2026-03-11
**Author:** Delightful Hammers
**Related:** v0.8.0 milestone, TDD-003 (review agent), TDD-004 (review personas)

---

## Overview

Telesis review and drift run locally and produce terminal output. v0.8.0 gives them a
mouth: findings post as inline PR review comments, drift results post as idempotent PR
comments, and a GitHub Actions workflow runs both on every pull request. This replaces Bop
as the primary reviewer for the Telesis repo.

### What it does

1. Detects GitHub Actions PR context from the runner environment
2. Converts review findings into GitHub PR reviews with inline comments
3. Converts drift reports into idempotent PR comments (update-or-create)
4. Posts reviews and comments via the GitHub REST API
5. Runs both review and drift as parallel CI jobs on every PR

### What it does not do (scope boundary)

- Does not implement GitHub check runs or status checks (uses PR reviews and comments)
- Does not support non-GitHub forges (GitLab, Bitbucket)
- Does not implement webhook-driven triggering (GitHub Actions only)
- Does not solve the review convergence problem (findings don't decrease across rounds;
  tracked in #40, addressed in TDD-006)

---

## Architecture

### Package Structure

```
src/github/
  types.ts            — GitHub-specific interfaces
  environment.ts      — CI detection, PR context extraction
  format.ts           — Finding → markdown, drift → markdown
  adapter.ts          — Orchestration: payload construction, post-or-update logic
  client.ts           — Raw fetch wrappers (only file that calls fetch)
```

This follows the same containment pattern as the model client: `client.ts` is the only
file that calls `fetch` for the GitHub API, mirroring how `src/agent/model/client.ts` is
the only file that imports `@anthropic-ai/sdk`. All other code uses the adapter and format
modules.

### Layer Responsibilities

**`environment.ts`** — Reads `GITHUB_EVENT_PATH` and `GITHUB_TOKEN` from the process
environment. Parses the event payload JSON. Validates all fields defensively: PR number
must be a positive integer, commit SHA must be exactly 40 hex characters, owner/repo must
match `[\w.-]+` with exactly one slash. Returns `null` when not in a valid PR context
(push events, schedule, missing env vars).

**`format.ts`** — Pure functions that convert domain types (ReviewFinding, ReviewSession,
DriftReport) into GitHub-flavored markdown strings. No side effects, no API calls. The
drift formatter embeds a hidden HTML marker (`<!-- telesis:drift -->`) for idempotent
comment detection.

**`adapter.ts`** — Orchestration layer that connects domain logic to the API client.
`findingsToReview` splits findings into inline comments (those with line info) and summary
body entries (those without). `postReviewToGitHub` constructs the payload and delegates to
the client. `upsertDriftComment` implements find-or-create semantics using the marker.

**`client.ts`** — Thin fetch wrappers for four GitHub REST API endpoints. Handles retry
(one attempt on 5xx), 422 fallback (strip inline comments when lines are outside the
diff), 403 error messages (actionable token permission guidance), and redirect prevention
(`redirect: 'error'` on all fetch calls to prevent Authorization header leaking).

### CLI Integration Pattern

The CLI layer (`drift.ts`, `review.ts`) adds a `--github-pr` flag and a `postXxxSafe`
wrapper that:

1. Calls `extractPRContext()` — warns and returns if null
2. Calls the adapter function (`postReviewToGitHub` or `upsertDriftComment`)
3. Logs the result to stderr
4. Catches all errors and logs a warning (never changes the exit code)

The CLI never imports from `client.ts` directly — it uses the adapter. The adapter never
imports from `commander` — it knows nothing about the CLI framework.

---

## Types

### GitHubPRContext

```typescript
interface GitHubPRContext {
  readonly owner: string;
  readonly repo: string;
  readonly pullNumber: number;
  readonly commitSha: string;
  readonly token: string;
}
```

Extracted once per invocation from the GitHub Actions environment. Passed to all client
functions. Validated at construction time in `extractPRContext`.

### PRReviewComment

```typescript
interface PRReviewComment {
  readonly path: string;
  readonly body: string;
  readonly line: number;
  readonly startLine?: number;
  readonly side: "RIGHT";
}
```

`line` is always the end line (or the only line for single-line comments). `startLine` is
included only for multi-line comments where `startLine !== endLine`. `side` is always
`RIGHT` — we review additions, not deletions.

### PostReviewResult / PostCommentResult

```typescript
interface PostReviewResult {
  readonly reviewId: number;
  readonly commentCount: number;
  readonly summaryFindingCount: number;
}

interface PostCommentResult {
  readonly commentId: number;
}
```

### ReviewEvent

```typescript
type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
```

Selection logic: zero findings → `APPROVE`, critical or high → `REQUEST_CHANGES`,
medium/low only → `COMMENT`.

---

## API Client Design

### Endpoints Used

| Function | Method | Endpoint |
|----------|--------|----------|
| `postPullRequestReview` | POST | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews` |
| `postPRComment` | POST | `/repos/{owner}/{repo}/issues/{issue_number}/comments` |
| `findCommentByMarker` | GET | `/repos/{owner}/{repo}/issues/{issue_number}/comments` |
| `updatePRComment` | PATCH | `/repos/{owner}/{repo}/issues/comments/{comment_id}` |

### Error Handling Strategy

- **5xx**: Retry once after 2s flat delay, then throw. Response body is drained before
  retry to release the connection.
- **422 on review post**: Fall back to summary-only review (strip inline comments). This
  handles the common case where inline comments reference lines outside the diff. The
  fallback uses plain `fetch` (no retry) because the inline comments were the likely 422
  cause.
- **403**: Throw with actionable message about `pull-requests: write` token permission.
- **Redirects**: All fetch calls set `redirect: 'error'` to prevent the Authorization
  header from leaking to third-party hosts on unexpected 3xx responses.
- **Non-array response**: `findCommentByMarker` guards with `Array.isArray` before
  searching, returning `null` on unexpected response shapes.

### Pagination Limitation

`findCommentByMarker` fetches only the first 100 comments (`per_page=100`). On PRs with
100+ comments, the drift marker may not be found, resulting in a duplicate comment rather
than an update. This is documented in JSDoc and accepted as a practical trade-off — PRs
with 100+ comments are extremely rare.

---

## Idempotent Drift Comments

Drift comments use a find-or-create pattern:

1. `findCommentByMarker(ctx, "<!-- telesis:drift -->")` searches existing PR comments
2. If found → `updatePRComment(ctx, commentId, newBody)` — updates in place
3. If not found → `postPRComment(ctx, body)` — creates new

This means each push to a PR updates the existing drift comment rather than creating a
new one. The marker is a hidden HTML comment embedded at the top of the body, invisible
in rendered markdown.

---

## GitHub Actions Workflow

### Structure

Two parallel jobs, both with skip-check support via `[skip review]` or
`[skip code-review]` in the commit message, PR title, or PR body.

**`drift` job**: Checkout → setup → build → `./telesis drift --github-pr`. Uses only
`GITHUB_TOKEN` (no API key needed — drift checks are deterministic).

**`review` job**: Same setup, plus artifact download for cross-round theme continuity →
`./telesis review --ref origin/main...HEAD --github-pr` → artifact upload. Requires
`ANTHROPIC_API_KEY` secret.

### Cross-Round Theme Continuity

GitHub Actions runners are ephemeral — `.telesis/reviews/` doesn't persist between runs.
The workflow uses `actions/upload-artifact` / `actions/download-artifact` to cache session
files:

1. Download prior sessions (continue-on-error for first run)
2. Run review (adds new session files to the directory)
3. Upload the combined directory (old + new sessions)

Artifact names are scoped per PR (`telesis-review-sessions-{pr_number}`) to prevent
cross-PR theme contamination.

---

## Decisions

1. **Raw `fetch`, not a GitHub SDK.** The client needs four endpoints. An SDK would add a
   dependency for marginal benefit. The containment pattern (one file calls fetch) keeps
   the coupling manageable.

2. **`--github-pr` as explicit opt-in.** The CLI never auto-posts just because it detects
   CI. Explicit is better than implicit — a user running `telesis review` locally shouldn't
   accidentally post to GitHub.

3. **Adapter layer between domain and client.** The CLI doesn't call fetch wrappers
   directly. The adapter translates domain concepts (findings, drift reports) into API
   payloads. This keeps the CLI thin and the client focused on HTTP mechanics.

4. **Warnings, not crashes, on GitHub posting failures.** The review and drift results are
   already printed to the terminal. GitHub posting is a best-effort side effect — a network
   failure or permission issue should warn, not change the exit code.

5. **One-shot review model.** Each push triggers a fresh review. Cross-round themes handle
   continuity by suppressing known issues rather than attempting incremental review. This
   avoids the complexity of tracking which lines changed between pushes.

6. **PR-scoped artifacts.** Review session artifacts are named per PR number, not globally.
   This prevents theme extraction from loading sessions for unrelated PRs, which would
   suppress legitimate findings.

---

## Resolved Questions

1. **Why not use GitHub check runs instead of PR reviews?** PR reviews support inline
   comments on specific lines, which is the highest-value output for code review. Check
   runs would require a separate UI integration. Reviews are natively rendered in the PR
   diff view.

2. **Why idempotent drift comments instead of one per push?** A PR with 10 pushes would
   accumulate 10 drift comments, creating noise. Updating a single comment keeps the PR
   clean and shows only the latest state.

3. **Why flat retry delay instead of exponential backoff?** Only one retry is attempted.
   Exponential backoff is meaningful with multiple retries. A single 2s delay is sufficient
   for transient GitHub API blips.

4. **Why drain the 5xx response body before retry?** If the response body is not consumed,
   the underlying TCP connection may not be released back to the pool, potentially causing
   connection exhaustion under load.
