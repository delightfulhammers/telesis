# TDD-023 — Jira Intake Adapter

**Status:** Accepted
**Date:** 2026-04-04
**Author:** Delightful Hammers
**Related:** v0.32.0 milestone, #114, TDD-011

---

## Overview

Telesis's intake system has a clean `IntakeSource` adapter pattern (TDD-011) but only
implements GitHub. For work environments that use Jira for issue tracking, a Jira adapter
is needed.

This TDD adds a Jira REST API client, a Jira intake source adapter, and the corresponding
config/CLI/MCP wiring. The sync pipeline, work item store, and approval flow are unchanged —
the adapter pattern means Jira issues enter the system as `RawIssue` objects identical to
GitHub issues from that point forward.

### What this TDD addresses

- Jira REST API client (`src/jira/client.ts`) — search issues via JQL, get issue details
- Jira intake source adapter (`src/intake/jira-source.ts`) implementing `IntakeSource`
- Auth: Jira Cloud (email + API token) and Jira Server/Data Center (PAT)
- Config format (`intake.jira`) with JQL, project, assignee, status filters
- CLI command (`telesis intake jira`)
- MCP tool (`telesis_intake_jira`)
- Extension of `IntakeSourceKind` to include `"jira"`

### What this TDD does not address (scope boundary)

- Confluence integration (separate concern — doc ingestion, not work intake)
- Jira webhooks or real-time sync
- Bidirectional sync (writing back to Jira: status transitions, comments)
- Jira custom fields beyond standard fields
- Jira Service Management / JSM-specific features
- OAuth 2.0 auth (API tokens are sufficient for Cloud and Server)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI / MCP                              │
│                                                             │
│  telesis intake jira          telesis_intake_jira (MCP)     │
│    │                              │                         │
│    ▼                              ▼                         │
│  ┌───────────────────────────────────────────┐              │
│  │          Sync Orchestrator (existing)      │              │
│  │          syncFromSource(rootDir, source)   │              │
│  └───────────────────┬───────────────────────┘              │
│                      │                                      │
│                      ▼                                      │
│  ┌──────────────────┐    ┌────────────────────┐             │
│  │  Jira Source     │    │  GitHub Source      │             │
│  │  (IntakeSource)  │    │  (IntakeSource)     │             │
│  └──────────┬───────┘    └────────────────────┘             │
│             │                                               │
│             ▼                                               │
│  ┌──────────────────┐    ┌────────────────────┐             │
│  │  Jira Client     │    │  Work Item Store    │             │
│  │  src/jira/       │    │  (existing)         │             │
│  └──────────────────┘    └────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

New code:
- `src/jira/` — new package for Jira API client
- `src/intake/jira-source.ts` — adapter
- Modifications to `src/intake/types.ts`, `src/config/config.ts`, `src/cli/intake.ts`,
  `src/mcp/tools/intake.ts`

---

## Types

### Jira API Types

```typescript
/** Jira issue as returned by the REST API search endpoint */
interface JiraIssue {
  readonly id: string;          // "10001"
  readonly key: string;         // "PROJ-42"
  readonly self: string;        // API URL
  readonly fields: {
    readonly summary: string;
    readonly description: string | null;
    readonly status: { readonly name: string };
    readonly priority?: { readonly name: string } | null;
    readonly assignee?: { readonly displayName: string; readonly accountId: string } | null;
    readonly labels: readonly string[];
    readonly issuetype: { readonly name: string };
  };
}

/** Jira search response (paginated) */
interface JiraSearchResponse {
  readonly issues: readonly JiraIssue[];
  readonly total: number;
  readonly maxResults: number;
  readonly startAt: number;
}
```

### Jira Auth

```typescript
/** Jira Cloud: email + API token → Basic auth */
/** Jira Server/Data Center: PAT → Bearer auth */
type JiraAuthMode = "basic" | "bearer";

interface JiraAuth {
  readonly mode: JiraAuthMode;
  readonly token: string;
  readonly email?: string;  // required for basic (Cloud)
}
```

### IntakeJiraConfig

```typescript
interface IntakeJiraConfig {
  readonly baseUrl: string;              // e.g., "https://yourcompany.atlassian.net"
  readonly project?: string;             // e.g., "PROJ" — filter by project key
  readonly jql?: string;                 // custom JQL override (takes precedence)
  readonly labels?: readonly string[];
  readonly assignee?: string;            // Jira accountId or displayName
  readonly status?: readonly string[];   // e.g., ["To Do", "In Progress"]
  readonly issueTypes?: readonly string[]; // e.g., ["Bug", "Story", "Task"]
}
```

### Extended IntakeSourceKind

```typescript
type IntakeSourceKind = "github" | "jira";
```

---

## Jira Client

### `src/jira/client.ts`

Minimal Jira REST API client. Only implements what intake needs.

```typescript
interface JiraClientConfig {
  readonly baseUrl: string;   // trailing slash stripped
  readonly auth: JiraAuth;
}

/** Create headers for Jira API calls */
const headers = (auth: JiraAuth): Record<string, string>;

/** Search issues using JQL with pagination */
const searchIssues = async (
  config: JiraClientConfig,
  jql: string,
  maxResults?: number,
): Promise<readonly JiraIssue[]>;
```

**API endpoint:** `POST /rest/api/2/search` (v2 for broadest compatibility with Cloud
and Server).

**Pagination:** Jira uses `startAt` + `maxResults`. Fetch pages until
`startAt + maxResults >= total`. Cap at 1000 issues (10 pages × 100).

**Error handling:** `JiraApiError` class mirroring `GitHubApiError` — includes status
code and response body. 401/403 errors include actionable messages about token
configuration.

### `src/jira/types.ts`

All Jira-specific type definitions.

---

## Auth Resolution

```typescript
/** Resolve Jira auth from environment variables */
const resolveJiraAuth = (): JiraAuth | null;
```

**Precedence:**
1. `JIRA_TOKEN` + `JIRA_EMAIL` → Basic auth (Jira Cloud)
2. `JIRA_TOKEN` alone → Bearer auth (Jira Server/Data Center PAT)
3. `null` if `JIRA_TOKEN` not set

Jira Cloud requires Basic auth with `email:api_token` base64-encoded.
Jira Server/Data Center uses Bearer token with a PAT.

The auth mode is auto-detected: if `JIRA_EMAIL` is present, use Basic; otherwise Bearer.

---

## Config Format

```yaml
intake:
  jira:
    baseUrl: "https://yourcompany.atlassian.net"
    project: "PROJ"
    labels:
      - "ready-for-dev"
    assignee: "john.smith"
    status:
      - "To Do"
      - "Ready"
    issueTypes:
      - "Bug"
      - "Story"
      - "Task"
```

### JQL Construction

When `jql` is not provided, one is constructed from the filter fields:

```
project = "PROJ"
  AND labels IN ("ready-for-dev")
  AND assignee = "john.smith"
  AND status IN ("To Do", "Ready")
  AND issuetype IN ("Bug", "Story", "Task")
ORDER BY priority DESC, created ASC
```

When `jql` is provided, it takes precedence — filter fields are ignored. This is the
escape hatch for complex queries.

```yaml
intake:
  jira:
    baseUrl: "https://yourcompany.atlassian.net"
    jql: 'project = PROJ AND sprint in openSprints() AND assignee = currentUser()'
```

---

## Intake Source Adapter

### `src/intake/jira-source.ts`

```typescript
/** Convert a Jira issue to a RawIssue for normalization */
const toRawIssue = (issue: JiraIssue, baseUrl: string): RawIssue => ({
  sourceId: issue.key,                          // "PROJ-42" (not numeric ID)
  sourceUrl: `${baseUrl}/browse/${issue.key}`,  // human-readable URL
  title: issue.fields.summary,
  body: issue.fields.description ?? "",
  labels: [...issue.fields.labels],
  assignee: issue.fields.assignee?.displayName,
  priority: issue.fields.priority?.name,
});

/** Create a Jira IntakeSource adapter */
const createJiraSource = (
  config: IntakeJiraConfig,
  auth: JiraAuth,
): IntakeSource => ({
  kind: "jira",
  fetchIssues: async (): Promise<readonly RawIssue[]> => {
    const jql = config.jql ?? buildJql(config);
    const client = { baseUrl: config.baseUrl.replace(/\/+$/, ""), auth };
    const issues = await searchIssues(client, jql);
    return issues.map((i) => toRawIssue(i, client.baseUrl));
  },
});
```

### `sourceId` choice

Uses `issue.key` (e.g., `"PROJ-42"`) not `issue.id` (e.g., `"10001"`). The key is
human-readable, stable across Jira migrations, and matches what users type. Dedup uses
`source + sourceId`, so `"jira:PROJ-42"` is globally unique.

---

## CLI Command

### `telesis intake jira`

```
telesis intake jira
```

No flags beyond what exists on `telesis intake github`. The Jira-specific configuration
lives in `config.yml`.

**Wiring in `src/cli/intake.ts`:**

```typescript
intake
  .command("jira")
  .description("Import issues from Jira")
  .action(handleAction(async () => {
    const rootDir = resolveProjectRoot();
    const rawConfig = loadRawConfig(rootDir);
    const intakeConfig = parseIntakeConfig(rawConfig);
    
    if (!intakeConfig.jira?.baseUrl) {
      throw new Error("Jira base URL not configured. Add intake.jira.baseUrl to .telesis/config.yml");
    }
    
    const auth = resolveJiraAuth();
    if (!auth) {
      throw new Error("JIRA_TOKEN not set. Set JIRA_TOKEN (and JIRA_EMAIL for Jira Cloud).");
    }
    
    const source = createJiraSource(intakeConfig.jira, auth);
    const result = await syncFromSource(rootDir, source);
    // ... print results (same format as GitHub)
  }));
```

---

## MCP Tool

### `telesis_intake_jira`

New tool in `src/mcp/tools/intake.ts` alongside existing `telesis_intake_list` and
`telesis_intake_show`. Follows the same pattern as the GitHub intake MCP would (currently
intake only has list/show MCP tools — GitHub sync is CLI-only).

```typescript
server.tool(
  "telesis_intake_jira",
  "Import issues from Jira (requires JIRA_TOKEN)",
  { projectRoot: z.string().optional() },
  async ({ projectRoot }) => { ... },
);
```

Also add `telesis_intake_github` as an MCP tool for symmetry (currently missing).

---

## Config Parsing

### `src/config/config.ts`

Extend `IntakeConfig` and add `parseIntakeConfig` support for the `jira` key:

```typescript
interface IntakeJiraConfig {
  readonly baseUrl: string;
  readonly project?: string;
  readonly jql?: string;
  readonly labels?: readonly string[];
  readonly assignee?: string;
  readonly status?: readonly string[];
  readonly issueTypes?: readonly string[];
}

interface IntakeConfig {
  readonly github?: IntakeGitHubConfig;
  readonly jira?: IntakeJiraConfig;
}
```

`baseUrl` is required — `parseIntakeConfig` validates it's a non-empty string with a URL
pattern. Other fields follow the same lenient parsing as GitHub config.

---

## File Organization

```
src/jira/
  client.ts           — Jira REST API client (search, pagination, error handling)
  client.test.ts
  types.ts            — Jira API type definitions
  auth.ts             — resolveJiraAuth(), auth header construction
  auth.test.ts

src/intake/
  jira-source.ts      — IntakeSource adapter for Jira (NEW)
  jira-source.test.ts — Tests with mocked Jira client (NEW)
  types.ts            — Extend IntakeSourceKind (MODIFY)

src/config/
  config.ts           — Add IntakeJiraConfig, extend parseIntakeConfig (MODIFY)
  config.test.ts      — Add Jira config parsing tests (MODIFY)

src/cli/
  intake.ts           — Add `telesis intake jira` command (MODIFY)

src/mcp/tools/
  intake.ts           — Add telesis_intake_jira tool (MODIFY)
```

---

## Decisions

1. **`sourceId` = issue key, not numeric ID.** `PROJ-42` is human-readable and stable.
   Dedup key becomes `"jira:PROJ-42"`. If a user moves an issue between projects (key
   changes), it imports as a new work item — acceptable behavior.

2. **JQL as the query language.** JQL is Jira's native query language and the most flexible
   way to express filters. Config fields (`project`, `labels`, `assignee`, `status`,
   `issueTypes`) are convenience — they compile to JQL. Custom `jql` overrides everything.

3. **REST API v2, not v3.** v2 is supported on both Jira Cloud and Jira Server/Data Center.
   v3 is Cloud-only and uses ADF (Atlassian Document Format) for description fields, which
   adds complexity. v2 returns plain text/wiki markup descriptions, which map cleanly to
   `RawIssue.body`.

4. **Auto-detect auth mode from env vars.** `JIRA_EMAIL` present → Basic auth (Cloud).
   Absent → Bearer auth (Server PAT). No config field for auth mode — it's derived.

5. **No Jira write operations.** This TDD is intake-only. Writing back to Jira (status
   transitions, comments, closing issues) is a separate concern tracked by the bidirectional
   sync feature.

6. **POST for search, not GET.** Jira's search endpoint supports both, but POST avoids
   URL length limits with complex JQL queries. Always use POST.

---

## Testing Strategy

- All tests colocated with source
- `src/jira/client.test.ts`: mock fetch, verify URL construction, pagination, error handling
- `src/jira/auth.test.ts`: env var combinations (Cloud vs Server), missing token
- `src/intake/jira-source.test.ts`: mock Jira client, verify RawIssue mapping, JQL construction
- `src/config/config.test.ts`: Jira config parsing (baseUrl required, optional fields, invalid values)
- Existing GitHub intake tests unchanged
- No live Jira API calls in unit tests
