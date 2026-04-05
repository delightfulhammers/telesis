# TDD-028 — Confluence Doc Ingestion

**Status:** Accepted
**Date:** 2026-04-05
**Author:** Delightful Hammers
**Related:** #115

---

## Overview

When onboarding an existing project that has documentation in Confluence, `telesis init`
should be able to import those pages as markdown before running init detection. This
converts Confluence into a doc *source* — pages are fetched, converted to markdown, and
written to the docs directory, where the normal "existing docs" init mode picks them up.

### What this TDD addresses

- Confluence REST API client (`src/confluence/client.ts`) — fetch pages by space key
- XHTML-to-markdown converter (`src/confluence/convert.ts`) — Confluence storage format → markdown
- Space ingestion orchestrator (`src/confluence/ingest.ts`) — fetch → convert → write
- CLI integration: `telesis init --confluence <space-key>` flag
- Auth: reuses Atlassian auth from `src/jira/auth.ts` (same `JIRA_TOKEN`/`JIRA_EMAIL`)

### What this TDD does not address (scope boundary)

- Bidirectional sync (pushing docs back to Confluence)
- Page selection (imports all pages in a space; filtering is future work)
- Confluence Cloud vs Server API differences (v2 API; same as Jira approach)
- Attachment/image import
- Nested page hierarchy preservation (pages are flattened to individual files)

---

## Architecture

```
telesis init --confluence PROJ
  │
  ▼
┌──────────────────────────────────────────────┐
│  Pre-init: Confluence ingestion              │
│                                              │
│  fetchSpacePages(config, spaceKey)           │
│    │                                         │
│    ▼                                         │
│  storageToMarkdown(page.body.storage.value)  │
│    │                                         │
│    ▼                                         │
│  Write docs/<slugified-title>.md             │
│    (with YAML frontmatter: title, source,    │
│     page_id)                                 │
└──────────────────────────────────────────────┘
  │
  ▼
Normal init detection (existing docs mode)
```

The Confluence ingestion runs *before* `detectState()` in the init flow. After pages
are written to `docs/`, the init detector sees them as existing docs and enters
"existing" mode — extracting config, scaffolding, generating CLAUDE.md.

---

## Confluence Storage Format

Confluence stores page content as XHTML ("storage format"). The converter handles:

- Headings (`<h1>`–`<h6>`) → `#` markdown headings
- Bold/italic (`<strong>`, `<em>`, `<b>`, `<i>`) → `**` / `*`
- Code (`<code>`, `<pre>`, Confluence code macro) → backtick/fenced blocks
- Links (`<a href>`) → `[text](url)`
- Lists (`<ul>`, `<ol>`, `<li>`) → `-` / numbered
- Paragraphs (`<p>`) → double newline
- Tables (basic) → pipe-delimited markdown
- Confluence macros (`<ac:structured-macro>`) → stripped
- HTML entities → decoded

The converter is regex-based, not a full HTML parser. This is sufficient for the
structural subset of XHTML that Confluence uses. Complex layouts (multi-column,
nested macros) degrade gracefully to plain text.

---

## Auth

Reuses `resolveJiraAuth()` from `src/jira/auth.ts`. Confluence Cloud and Jira Cloud
share the same Atlassian authentication:

- `JIRA_TOKEN` + `JIRA_EMAIL` → Basic auth (Cloud)
- `JIRA_TOKEN` alone → Bearer auth (Server/Data Center)

The Confluence base URL is resolved from `CONFLUENCE_BASE_URL` env var.

---

## File Organization

```
src/confluence/
  types.ts             — ConfluencePage, ConfluenceSearchResponse, ConfluenceClientConfig
  client.ts            — REST API client (fetchSpacePages, fetchPage)
  client.test.ts
  convert.ts           — storageToMarkdown XHTML→markdown converter
  convert.test.ts
  ingest.ts            — ingestConfluenceSpace orchestrator
  ingest.test.ts
```

---

## Decisions

1. **Pre-init hook, not a standalone command.** Confluence ingestion is a step in the
   init flow, not a separate `telesis confluence` command. This keeps the UX simple —
   one command to go from "Confluence space" to "initialized project."

2. **Regex-based converter, not an HTML parser.** Confluence storage format is a known
   XHTML subset. A regex converter is ~80 lines, zero dependencies, and handles the
   common cases. A full HTML parser (cheerio, jsdom) would add 500KB+ of dependencies
   for marginal improvement on edge cases.

3. **Flat file output.** Confluence pages are written as individual markdown files,
   not preserving the page tree hierarchy. File names are slugified from page titles.
   This matches how Telesis expects docs — flat files in a docs directory.

4. **Idempotent.** Existing files are not overwritten. Running init with `--confluence`
   multiple times is safe — only new pages are written.

5. **Shared auth.** No separate `CONFLUENCE_TOKEN` — reuses `JIRA_TOKEN`/`JIRA_EMAIL`
   since they're the same Atlassian account. Reduces configuration burden.

---

## Testing Strategy

- `src/confluence/convert.test.ts`: XHTML→markdown for all supported elements, edge cases,
  Confluence macros, HTML entities, empty input
- `src/confluence/client.test.ts`: mock fetch, pagination, HTTPS validation, auth, errors
- `src/confluence/ingest.test.ts`: mock fetch, file writing, idempotency, slugification
