import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createJiraSource, buildJql } from "./jira-source.js";
import type { IntakeJiraConfig } from "../config/config.js";
import type { JiraAuth, JiraSearchResponse } from "../jira/types.js";

const mockFetch =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const auth: JiraAuth = { mode: "bearer", token: "pat-test" };

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const makeSearchResponse = (
  issues: readonly {
    key: string;
    summary: string;
    labels?: readonly string[];
    assignee?: string;
    priority?: string;
  }[],
): JiraSearchResponse => ({
  issues: issues.map((i, idx) => ({
    id: String(10000 + idx),
    key: i.key,
    self: `https://company.atlassian.net/rest/api/2/issue/${i.key}`,
    fields: {
      summary: i.summary,
      description: `Description for ${i.summary}`,
      status: { name: "To Do" },
      priority: i.priority ? { name: i.priority } : { name: "Medium" },
      assignee: i.assignee
        ? { displayName: i.assignee, accountId: "acc-123" }
        : null,
      labels: i.labels ? [...i.labels] : [],
      issuetype: { name: "Task" },
    },
  })),
  total: issues.length,
  maxResults: 100,
  startAt: 0,
});

describe("buildJql", () => {
  it("builds JQL with project filter", () => {
    const config: IntakeJiraConfig = {
      baseUrl: "https://x.atlassian.net",
      project: "PROJ",
    };
    expect(buildJql(config)).toBe(
      'project = "PROJ" ORDER BY priority DESC, created ASC',
    );
  });

  it("builds JQL with all filters", () => {
    const config: IntakeJiraConfig = {
      baseUrl: "https://x.atlassian.net",
      project: "PROJ",
      labels: ["ready", "bug"],
      assignee: "john.smith",
      status: ["To Do", "In Progress"],
      issueTypes: ["Bug", "Story"],
    };
    const jql = buildJql(config);
    expect(jql).toContain('project = "PROJ"');
    expect(jql).toContain('labels IN ("ready", "bug")');
    expect(jql).toContain('assignee = "john.smith"');
    expect(jql).toContain('status IN ("To Do", "In Progress")');
    expect(jql).toContain('issuetype IN ("Bug", "Story")');
    expect(jql).toContain("ORDER BY priority DESC, created ASC");
  });

  it("returns ORDER BY only when no filters", () => {
    const config: IntakeJiraConfig = {
      baseUrl: "https://x.atlassian.net",
    };
    expect(buildJql(config)).toBe("ORDER BY priority DESC, created ASC");
  });

  it("escapes special characters in values", () => {
    const config: IntakeJiraConfig = {
      baseUrl: "https://x.atlassian.net",
      project: 'My "Project"',
    };
    expect(buildJql(config)).toContain('project = "My \\"Project\\""');
  });
});

describe("createJiraSource", () => {
  it("returns IntakeSource with kind jira", () => {
    const config: IntakeJiraConfig = {
      baseUrl: "https://company.atlassian.net",
      project: "PROJ",
    };
    const source = createJiraSource(config, auth);
    expect(source.kind).toBe("jira");
  });

  it("fetches issues and maps to RawIssue format", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        makeSearchResponse([
          {
            key: "PROJ-42",
            summary: "Fix login bug",
            labels: ["bug"],
            assignee: "Jane Doe",
            priority: "High",
          },
        ]),
      ),
    );

    const config: IntakeJiraConfig = {
      baseUrl: "https://company.atlassian.net",
      project: "PROJ",
    };
    const source = createJiraSource(config, auth);
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      sourceId: "PROJ-42",
      sourceUrl: "https://company.atlassian.net/browse/PROJ-42",
      title: "Fix login bug",
      body: "Description for Fix login bug",
      labels: ["bug"],
      assignee: "Jane Doe",
      priority: "High",
    });
  });

  it("uses custom JQL when provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse([])));

    const config: IntakeJiraConfig = {
      baseUrl: "https://company.atlassian.net",
      jql: "sprint in openSprints() AND assignee = currentUser()",
    };
    const source = createJiraSource(config, auth);
    await source.fetchIssues();

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.jql).toBe(
      "sprint in openSprints() AND assignee = currentUser()",
    );
  });

  it("builds JQL from config when jql field is absent", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse([])));

    const config: IntakeJiraConfig = {
      baseUrl: "https://company.atlassian.net",
      project: "PROJ",
      status: ["To Do"],
    };
    const source = createJiraSource(config, auth);
    await source.fetchIssues();

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.jql).toContain('project = "PROJ"');
    expect(body.jql).toContain('status IN ("To Do")');
  });

  it("handles issues with null description and assignee", async () => {
    const response: JiraSearchResponse = {
      issues: [
        {
          id: "10001",
          key: "PROJ-1",
          self: "https://company.atlassian.net/rest/api/2/issue/PROJ-1",
          fields: {
            summary: "Minimal issue",
            description: null,
            status: { name: "Open" },
            priority: null,
            assignee: null,
            labels: [],
            issuetype: { name: "Task" },
          },
        },
      ],
      total: 1,
      maxResults: 100,
      startAt: 0,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(response));

    const config: IntakeJiraConfig = {
      baseUrl: "https://company.atlassian.net",
    };
    const source = createJiraSource(config, auth);
    const issues = await source.fetchIssues();

    expect(issues[0].body).toBe("");
    expect(issues[0].assignee).toBeUndefined();
    expect(issues[0].priority).toBeUndefined();
  });
});
