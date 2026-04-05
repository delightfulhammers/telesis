import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchIssues, JiraApiError } from "./client.js";
import type { JiraClientConfig, JiraSearchResponse } from "./types.js";

const mockFetch =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const config: JiraClientConfig = {
  baseUrl: "https://company.atlassian.net",
  auth: { mode: "bearer", token: "pat-test" },
};

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const makeSearchResponse = (
  issues: readonly { key: string; summary: string }[],
  total: number,
  startAt = 0,
): JiraSearchResponse => ({
  issues: issues.map((i, idx) => ({
    id: String(10000 + idx),
    key: i.key,
    self: `https://company.atlassian.net/rest/api/2/issue/${i.key}`,
    fields: {
      summary: i.summary,
      description: null,
      status: { name: "To Do" },
      priority: { name: "Medium" },
      assignee: null,
      labels: [],
      issuetype: { name: "Task" },
    },
  })),
  total,
  maxResults: 100,
  startAt,
});

describe("searchIssues", () => {
  it("sends POST to /rest/api/2/search with JQL", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeSearchResponse([{ key: "PROJ-1", summary: "Test" }], 1)),
    );

    const issues = await searchIssues(config, "project = PROJ");

    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe("PROJ-1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://company.atlassian.net/rest/api/2/search");
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body.jql).toBe("project = PROJ");
    expect(body.fields).toContain("summary");
    expect(body.fields).toContain("description");
  });

  it("paginates across multiple pages", async () => {
    const page1Issues = Array.from({ length: 2 }, (_, i) => ({
      key: `PROJ-${i + 1}`,
      summary: `Issue ${i + 1}`,
    }));
    const page2Issues = [{ key: "PROJ-3", summary: "Issue 3" }];

    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeSearchResponse(page1Issues, 3, 0)),
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeSearchResponse(page2Issues, 3, 2)),
    );

    const issues = await searchIssues(config, "project = PROJ", 2);

    expect(issues).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify startAt in second request
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1]!.body as string);
    expect(secondBody.startAt).toBe(2);
  });

  it("stops when all results are fetched", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        makeSearchResponse([{ key: "PROJ-1", summary: "Only one" }], 1),
      ),
    );

    const issues = await searchIssues(config, "project = PROJ");

    expect(issues).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws JiraApiError on 401", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(searchIssues(config, "project = PROJ")).rejects.toThrow(
      "authentication failed",
    );
  });

  it("throws JiraApiError on 403", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    await expect(searchIssues(config, "project = PROJ")).rejects.toThrow(
      "permission denied",
    );
  });

  it("retries once on 5xx", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Error", { status: 500 }),
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeSearchResponse([{ key: "PROJ-1", summary: "Test" }], 1)),
    );

    const issues = await searchIssues(config, "project = PROJ");

    expect(issues).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 5000);

  it("strips trailing slashes from baseUrl", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse([], 0)));

    const trailingConfig: JiraClientConfig = {
      ...config,
      baseUrl: "https://company.atlassian.net///",
    };
    await searchIssues(trailingConfig, "project = PROJ");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://company.atlassian.net/rest/api/2/search");
  });

  it("uses Basic auth for cloud config", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse([], 0)));

    const cloudConfig: JiraClientConfig = {
      baseUrl: "https://company.atlassian.net",
      auth: { mode: "basic", token: "api-token", email: "user@company.com" },
    };
    await searchIssues(cloudConfig, "project = PROJ");

    const [, init] = mockFetch.mock.calls[0];
    const authHeader = (init!.headers as Record<string, string>).Authorization;
    expect(authHeader).toMatch(/^Basic /);
    const decoded = Buffer.from(
      authHeader.replace("Basic ", ""),
      "base64",
    ).toString();
    expect(decoded).toBe("user@company.com:api-token");
  });

  it("rejects non-HTTPS baseUrl", async () => {
    const httpConfig: JiraClientConfig = {
      baseUrl: "http://internal-service",
      auth: { mode: "bearer", token: "pat-test" },
    };
    await expect(searchIssues(httpConfig, "project = PROJ")).rejects.toThrow(
      "must use HTTPS",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects private IP ranges in baseUrl", async () => {
    for (const host of [
      "169.254.169.254",
      "10.0.0.1",
      "192.168.1.1",
      "172.16.0.1",
      "127.0.0.1",
    ]) {
      const privateConfig: JiraClientConfig = {
        baseUrl: `https://${host}`,
        auth: { mode: "bearer", token: "pat-test" },
      };
      await expect(
        searchIssues(privateConfig, "project = PROJ"),
      ).rejects.toThrow("private IP ranges");
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("disables redirects to prevent auth header leaks", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse([], 0)));

    await searchIssues(config, "project = PROJ");

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.redirect).toBe("error");
  });
});

describe("JiraApiError", () => {
  it("preserves status, body, and message", () => {
    const err = new JiraApiError(404, '{"error":"not found"}', "issue missing");
    expect(err.status).toBe(404);
    expect(err.body).toBe('{"error":"not found"}');
    expect(err.message).toBe("issue missing");
    expect(err.name).toBe("JiraApiError");
  });
});
