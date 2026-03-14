import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GitHubApiError,
  headers,
  handleResponse,
  fetchWithRetry,
} from "./http.js";

const mockFetch =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GitHubApiError", () => {
  it("preserves status, body, and message", () => {
    const err = new GitHubApiError(422, '{"error":"bad"}', "validation failed");
    expect(err.status).toBe(422);
    expect(err.body).toBe('{"error":"bad"}');
    expect(err.message).toBe("validation failed");
    expect(err.name).toBe("GitHubApiError");
  });
});

describe("headers", () => {
  it("includes authorization and API version", () => {
    const h = headers("ghp_test123");
    expect(h.Authorization).toBe("Bearer ghp_test123");
    expect(h["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(h.Accept).toContain("github");
  });
});

describe("handleResponse", () => {
  it("returns parsed JSON on success", async () => {
    const response = new Response(JSON.stringify({ id: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const data = await handleResponse(response, "test");
    expect(data).toEqual({ id: 1 });
  });

  it("throws GitHubApiError with permission hint on 403", async () => {
    const response = new Response("forbidden", { status: 403 });

    await expect(handleResponse(response, "test")).rejects.toThrow(
      "permission denied",
    );
  });

  it("throws GitHubApiError on other errors", async () => {
    const response = new Response("not found", { status: 404 });

    await expect(handleResponse(response, "test")).rejects.toThrow(
      "GitHub API error 404",
    );
  });
});

describe("fetchWithRetry", () => {
  it("returns response on success", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchWithRetry(
      "https://api.github.com/test",
      { method: "GET", headers: headers("token") },
      "test",
    );

    expect(result).toEqual({ ok: true });
  });

  it("retries once on 5xx", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await fetchWithRetry(
      "https://api.github.com/test",
      { method: "GET", headers: headers("token") },
      "test",
    );

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 5000);

  it("disables redirects to prevent auth header leaks", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetchWithRetry(
      "https://api.github.com/test",
      { method: "GET" },
      "test",
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.redirect).toBe("error");
  });
});
