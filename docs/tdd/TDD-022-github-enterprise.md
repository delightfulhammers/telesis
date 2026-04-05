# TDD-022 — GitHub Enterprise Support

**Status:** Accepted
**Date:** 2026-04-04
**Author:** Delightful Hammers
**Related:** v0.32.0 milestone, #113

---

## Overview

Telesis's GitHub integration hardcodes `api.github.com` as the API base URL across
`src/github/http.ts` and `src/github/client.ts`. Token resolution only checks
`GITHUB_TOKEN` and `gh auth token`. Remote parsing only matches `github.com` remotes.

This blocks usage with GitHub Enterprise (GHE) instances — self-hosted installations
accessible on private networks with custom domains (e.g., `github.yourcompany.com`).

The fix is surgical: parameterize the API base URL, generalize remote parsing, and
thread the configuration through the existing module. No new abstractions — the
`src/github/` module stays GitHub-specific but gains GHE awareness.

### What this TDD addresses

- Configurable API base URL (`github.apiUrl` in config, `GITHUB_API_URL` env override)
- Remote URL parsing for GHE domains (not just `github.com`)
- GitHub client factory pattern to close over `apiBase` instead of module-level constant
- Config format for GitHub-specific settings
- Token resolution chain with GHE support

### What this TDD does not address (scope boundary)

- Abstractions for non-GitHub hosts (Gitea, GitLab, Bitbucket)
- OAuth or SSO auth flows (GHE PATs work the same as github.com PATs)
- GHE-specific API version differences (GHE tracks github.com API closely)
- CI/CD environment detection for GHE (GitHub Actions env vars work identically on GHE)

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Config Layer                           │
│                                                            │
│  .telesis/config.yml                                       │
│    github:                                                 │
│      apiUrl: https://github.yourcompany.com/api/v3        │
│                                                            │
│  Environment override:                                     │
│    GITHUB_API_URL=https://github.yourcompany.com/api/v3   │
│                                                            │
│  Precedence: env > config > default (api.github.com)       │
├────────────────────────────────────────────────────────────┤
│                     GitHub Module                          │
│                                                            │
│  createGitHubClient(apiBase)                               │
│    ├─ listRepoIssues(owner, repo, token, params)          │
│    ├─ postPullRequestReview(ctx, event, body, comments)   │
│    ├─ postPRComment(ctx, body)                            │
│    ├─ findCommentByMarker(ctx, marker)                    │
│    ├─ listPullRequestReviewComments(ctx)                  │
│    ├─ replyToReviewComment(ctx, commentId, body)          │
│    └─ updatePRComment(ctx, commentId, body)               │
│                                                            │
│  resolveGitHubApiBase(rawConfig)                           │
│    env GITHUB_API_URL > config github.apiUrl > default    │
│                                                            │
│  extractRepoContext(remoteDomain?)                         │
│    Parameterized regex: matches GHE domains too            │
└────────────────────────────────────────────────────────────┘
```

All changes are within `src/github/` and `src/config/`. No new directories.

---

## Types

### GitHubConfig

New config section for GitHub-specific settings.

```typescript
interface GitHubConfig {
  readonly apiUrl?: string;   // e.g., "https://github.yourcompany.com/api/v3"
}
```

### GitHubClient

Factory-created client that closes over `apiBase`. Replaces bare functions that
reference the module-level `API_BASE` constant.

```typescript
interface GitHubClient {
  readonly apiBase: string;
  readonly listRepoIssues: (
    owner: string, repo: string, token: string, params?: ListRepoIssuesParams,
  ) => Promise<readonly GitHubIssue[]>;
  readonly postPullRequestReview: (
    ctx: GitHubPRContext, event: ReviewEvent, body: string,
    comments: readonly PRReviewComment[],
  ) => Promise<PostReviewResult>;
  readonly postPRComment: (ctx: GitHubPRContext, body: string) => Promise<PostCommentResult>;
  readonly findCommentByMarker: (ctx: GitHubPRContext, marker: string) => Promise<number | null>;
  readonly listPullRequestReviewComments: (
    ctx: GitHubPRContext,
  ) => Promise<readonly GitHubReviewComment[]>;
  readonly replyToReviewComment: (
    ctx: GitHubPRContext, commentId: number, body: string,
  ) => Promise<{ id: number }>;
  readonly updatePRComment: (
    ctx: GitHubPRContext, commentId: number, body: string,
  ) => Promise<PostCommentResult>;
}
```

---

## Config Format

Added to `.telesis/config.yml` under a `github` key:

```yaml
github:
  apiUrl: "https://github.yourcompany.com/api/v3"
```

All fields optional. Missing config uses `https://api.github.com`.

### Resolution precedence

1. `GITHUB_API_URL` environment variable (highest priority — allows per-session override)
2. `github.apiUrl` in `.telesis/config.yml`
3. `https://api.github.com` (default)

```typescript
const resolveGitHubApiBase = (raw: RawConfig | null): string => {
  const env = process.env.GITHUB_API_URL;
  if (env) return env.replace(/\/+$/, "");

  const config = parseGitHubConfig(raw);
  if (config.apiUrl) return config.apiUrl.replace(/\/+$/, "");

  return "https://api.github.com";
};
```

---

## Changes

### `src/github/http.ts`

- Remove `export const API_BASE` constant
- Add `const DEFAULT_API_BASE = "https://api.github.com"` (not exported)
- Export `resolveApiBase(rawConfig): string` using the precedence chain above
- All other exports (`headers`, `fetchWithRetry`, `handleResponse`, `GitHubApiError`) unchanged

### `src/github/client.ts`

- Add `createGitHubClient(apiBase: string): GitHubClient` factory function
- Move all existing bare functions into the factory, closing over `apiBase` instead of `API_BASE`
- Keep bare function exports for backwards compatibility (they create a default client internally)
- This preserves the existing call sites while enabling GHE callers to pass a custom base

### `src/github/environment.ts`

- Parameterize `GITHUB_REMOTE_RE` — extract domain from config or accept as parameter
- `extractRepoContext(domain?: string)` — defaults to `github.com`, GHE passes custom domain
- `resolveGitHubToken()` unchanged — `GITHUB_TOKEN` works for both github.com and GHE
- Add `extractDomainFromApiUrl(apiUrl: string): string` helper for deriving remote domain

### `src/config/config.ts`

- Add `GitHubConfig` interface
- Add `parseGitHubConfig(raw): GitHubConfig` parser following existing pattern

### Call sites

Every existing caller of `listRepoIssues`, `postPullRequestReview`, etc. continues to work
unchanged because bare function exports are preserved. GHE-aware callers use
`createGitHubClient(apiBase)` instead.

Intake specifically: `createGitHubSource` gains an optional `apiBase` parameter,
threaded from config resolution at the CLI/MCP layer.

---

## Decisions

1. **Factory pattern, not dependency injection.** `createGitHubClient(apiBase)` is simpler
   than threading `apiBase` through every function signature. Existing bare exports preserved
   for backwards compat.

2. **Environment variable override.** `GITHUB_API_URL` takes precedence over config. This
   matches how `GITHUB_TOKEN` works and allows per-session switching without config changes.

3. **No separate GHE token env var.** `GITHUB_TOKEN` works for both github.com and GHE.
   If a user needs to distinguish tokens for multiple GitHub instances, they manage that
   externally (e.g., direnv). Adding `GITHUB_ENTERPRISE_TOKEN` is unnecessary complexity.

4. **Domain extraction from API URL.** GHE API URLs follow the pattern
   `https://<domain>/api/v3`. The domain is extracted for remote URL matching:
   `github.yourcompany.com/api/v3` → match remotes containing `github.yourcompany.com`.

5. **No API version negotiation.** GHE API is compatible with the `2022-11-28` version
   header. If a future GHE version diverges, we'll address it then.

6. **Env var reaches all code paths; config requires explicit threading.** The
   `GITHUB_API_URL` env var is read by the lazy default client at first call time,
   so all existing callers (review, drift, PR posting) automatically use GHE. The
   `github.apiUrl` config setting is only effective in callers that explicitly resolve
   it via `resolveGitHubApiBase()` and thread it to `createGitHubClient()` — currently
   the intake path. This is acceptable because env vars are the standard GHE deployment
   mechanism (direnv, shell profiles). Full config-driven support for all call sites
   is tracked for a future milestone.

---

## Testing Strategy

- All tests colocated: `http.test.ts`, `client.test.ts`, `environment.test.ts`
- `resolveApiBase` tests: env override, config override, default fallback, trailing slash stripping
- `createGitHubClient` tests: verify `apiBase` is used in constructed URLs (mock fetch)
- `extractRepoContext` tests: github.com remotes, GHE remotes, SSH and HTTPS variants
- `extractDomainFromApiUrl` tests: standard GHE URLs, trailing slashes, edge cases
- `parseGitHubConfig` tests: present, absent, invalid values
- Existing test suites continue to pass (bare function exports unchanged)
