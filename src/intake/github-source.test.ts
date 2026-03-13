import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGitHubSource } from "./github-source.js";
import type { IntakeGitHubConfig } from "../config/config.js";
import type { GitHubIssue } from "../github/types.js";

const mockFetch =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const makeIssue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
  number: 42,
  title: "Fix login bug",
  body: "The login form crashes",
  html_url: "https://github.com/owner/repo/issues/42",
  labels: [{ name: "bug" }],
  assignee: { login: "alice" },
  ...overrides,
});

describe("createGitHubSource", () => {
  it("fetches and normalizes issues to RawIssue", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([makeIssue()]));

    const source = createGitHubSource(undefined, "owner", "repo", "ghp_test");
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      sourceId: "42",
      sourceUrl: "https://github.com/owner/repo/issues/42",
      title: "Fix login bug",
      body: "The login form crashes",
      labels: ["bug"],
      assignee: "alice",
    });
  });

  it("filters out pull requests", async () => {
    const pr = makeIssue({
      number: 10,
      title: "PR: Add feature",
      pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/10" },
    });
    const issue = makeIssue({ number: 42 });

    mockFetch.mockResolvedValueOnce(jsonResponse([pr, issue]));

    const source = createGitHubSource(undefined, "owner", "repo", "ghp_test");
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]!.sourceId).toBe("42");
  });

  it("passes label filter to API", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const config: IntakeGitHubConfig = { labels: ["telesis", "ready"] };
    const source = createGitHubSource(config, "owner", "repo", "ghp_test");
    await source.fetchIssues();

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("labels=telesis%2Cready");
  });

  it("passes assignee filter to API", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const config: IntakeGitHubConfig = { assignee: "alice" };
    const source = createGitHubSource(config, "owner", "repo", "ghp_test");
    await source.fetchIssues();

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("assignee=alice");
  });

  it("excludes issues with excludeLabels", async () => {
    const wontfix = makeIssue({
      number: 1,
      labels: [{ name: "bug" }, { name: "wontfix" }],
    });
    const keep = makeIssue({
      number: 2,
      labels: [{ name: "bug" }],
    });

    mockFetch.mockResolvedValueOnce(jsonResponse([wontfix, keep]));

    const config: IntakeGitHubConfig = { excludeLabels: ["wontfix"] };
    const source = createGitHubSource(config, "owner", "repo", "ghp_test");
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]!.sourceId).toBe("2");
  });

  it("handles null body gracefully", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([makeIssue({ body: null })]));

    const source = createGitHubSource(undefined, "owner", "repo", "ghp_test");
    const issues = await source.fetchIssues();

    expect(issues[0]!.body).toBe("");
  });

  it("handles null assignee", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([makeIssue({ assignee: null })]),
    );

    const source = createGitHubSource(undefined, "owner", "repo", "ghp_test");
    const issues = await source.fetchIssues();

    expect(issues[0]!.assignee).toBeUndefined();
  });

  it("reports kind as github", () => {
    const source = createGitHubSource(undefined, "owner", "repo", "ghp_test");
    expect(source.kind).toBe("github");
  });
});
