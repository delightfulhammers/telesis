import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPRContext } from "./types.js";
import {
  postPullRequestReview,
  postPRComment,
  findCommentByMarker,
  updatePRComment,
} from "./client.js";

const mockCtx: GitHubPRContext = {
  owner: "delightfulhammers",
  repo: "telesis",
  pullNumber: 42,
  commitSha: "abc123",
  token: "ghp_test",
};

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

const errorResponse = (status: number, body: string): Response =>
  new Response(body, { status });

describe("postPullRequestReview", () => {
  it("sends correct URL and request body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 101 }));

    const result = await postPullRequestReview(
      mockCtx,
      "COMMENT",
      "Review body",
      [{ path: "src/a.ts", body: "Fix this", line: 10, side: "RIGHT" }],
    );

    expect(result).toEqual({
      reviewId: 101,
      commentCount: 1,
      summaryFindingCount: 0,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/pulls/42/reviews",
    );
    const body = JSON.parse(init!.body as string);
    expect(body.commit_id).toBe("abc123");
    expect(body.event).toBe("COMMENT");
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].path).toBe("src/a.ts");
    expect(body.comments[0].line).toBe(10);
    expect(body.comments[0].side).toBe("RIGHT");
  });

  it("maps startLine to start_line in request", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 102 }));

    await postPullRequestReview(mockCtx, "COMMENT", "body", [
      {
        path: "src/a.ts",
        body: "Fix",
        line: 15,
        startLine: 10,
        side: "RIGHT",
      },
    ]);

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.comments[0].start_line).toBe(10);
    expect(body.comments[0].line).toBe(15);
  });

  it("throws GitHubApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(422, '{"message":"Validation Failed"}'),
    );

    await expect(
      postPullRequestReview(mockCtx, "COMMENT", "Review body", [
        { path: "src/a.ts", body: "Fix", line: 10, side: "RIGHT" },
      ]),
    ).rejects.toThrow("422");
  });

  it("retries once on 5xx", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(500, "Internal Server Error"),
    );
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 104 }));

    const result = await postPullRequestReview(mockCtx, "COMMENT", "body", []);

    expect(result.reviewId).toBe(104);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws actionable error on 403", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(403, '{"message":"Resource not accessible"}'),
    );

    await expect(
      postPullRequestReview(mockCtx, "COMMENT", "body", []),
    ).rejects.toThrow("pull-requests: write");
  });
});

describe("postPRComment", () => {
  it("posts to the correct issues endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 201 }));

    const result = await postPRComment(mockCtx, "Drift report here");

    expect(result.commentId).toBe(201);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/issues/42/comments",
    );
  });
});

describe("findCommentByMarker", () => {
  it("returns comment ID when marker is found", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: 301, body: "unrelated comment" },
        { id: 302, body: "<!-- telesis:drift -->\nDrift report" },
      ]),
    );

    const id = await findCommentByMarker(mockCtx, "<!-- telesis:drift -->");
    expect(id).toBe(302);
  });

  it("returns null when marker is not found", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ id: 301, body: "unrelated comment" }]),
    );

    const id = await findCommentByMarker(mockCtx, "<!-- telesis:drift -->");
    expect(id).toBeNull();
  });
});

describe("updatePRComment", () => {
  it("patches the correct comment endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 302 }));

    const result = await updatePRComment(mockCtx, 302, "Updated body");

    expect(result.commentId).toBe(302);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/issues/comments/302",
    );
    expect(init!.method).toBe("PATCH");
  });
});
