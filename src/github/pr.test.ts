import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPullRequest, closeIssue, commentOnIssue } from "./pr.js";

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

describe("createPullRequest", () => {
  it("posts to correct endpoint and returns PR number and URL", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ number: 99, html_url: "https://github.com/o/r/pull/99" }),
    );

    const result = await createPullRequest({
      owner: "delightfulhammers",
      repo: "telesis",
      token: "ghp_test",
      title: "feat: Add auth",
      body: "Adds authentication",
      head: "telesis/abc-auth",
      base: "main",
    });

    expect(result).toEqual({
      number: 99,
      url: "https://github.com/o/r/pull/99",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/pulls",
    );
    const body = JSON.parse(init!.body as string);
    expect(body.title).toBe("feat: Add auth");
    expect(body.body).toBe("Adds authentication");
    expect(body.head).toBe("telesis/abc-auth");
    expect(body.base).toBe("main");
  });

  it("rejects invalid owner/repo names", async () => {
    await expect(
      createPullRequest({
        owner: "../evil",
        repo: "telesis",
        token: "ghp_test",
        title: "test",
        body: "",
        head: "branch",
        base: "main",
      }),
    ).rejects.toThrow(/Invalid owner or repo name/);
  });
});

describe("closeIssue", () => {
  it("patches issue state to closed", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ number: 42, state: "closed" }),
    );

    await closeIssue("delightfulhammers", "telesis", "ghp_test", 42);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/issues/42",
    );
    expect(init!.method).toBe("PATCH");
    const body = JSON.parse(init!.body as string);
    expect(body.state).toBe("closed");
  });

  it("rejects invalid owner/repo names", async () => {
    await expect(
      closeIssue("../evil", "telesis", "ghp_test", 42),
    ).rejects.toThrow(/Invalid owner or repo name/);
  });
});

describe("commentOnIssue", () => {
  it("posts comment to correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1001 }));

    await commentOnIssue(
      "delightfulhammers",
      "telesis",
      "ghp_test",
      42,
      "Completed by telesis pipeline",
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/issues/42/comments",
    );
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body.body).toBe("Completed by telesis pipeline");
  });

  it("rejects invalid owner/repo names", async () => {
    await expect(
      commentOnIssue("../evil", "telesis", "ghp_test", 42, "test"),
    ).rejects.toThrow(/Invalid owner or repo name/);
  });
});
