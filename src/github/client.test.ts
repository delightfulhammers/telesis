import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPRContext } from "./types.js";
import {
  postPullRequestReview,
  postPRComment,
  findCommentByMarker,
  updatePRComment,
  replyToReviewComment,
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

  it("paginates to find marker on a later page", async () => {
    // Page 1: 100 comments, no marker
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `comment ${i + 1}`,
    }));
    // Page 2: marker found
    const page2 = [
      { id: 201, body: "more comments" },
      { id: 202, body: "<!-- telesis:drift -->\nDrift report" },
    ];

    mockFetch.mockResolvedValueOnce(jsonResponse(page1));
    mockFetch.mockResolvedValueOnce(jsonResponse(page2));

    const id = await findCommentByMarker(mockCtx, "<!-- telesis:drift -->");
    expect(id).toBe(202);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops paginating when page has fewer than 100 results", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ id: 1, body: "only comment" }]),
    );

    const id = await findCommentByMarker(mockCtx, "<!-- telesis:drift -->");
    expect(id).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("stops after max pages", async () => {
    // 10 full pages of 100 comments each, no marker
    for (let i = 0; i < 10; i++) {
      const page = Array.from({ length: 100 }, (_, j) => ({
        id: i * 100 + j + 1,
        body: `comment ${i * 100 + j + 1}`,
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse(page));
    }

    const id = await findCommentByMarker(mockCtx, "<!-- telesis:drift -->");
    expect(id).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });
});

describe("replyToReviewComment", () => {
  it("posts reply to the correct pull request comments endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 401 }));

    const result = await replyToReviewComment(
      mockCtx,
      300,
      "[fp] Not a real issue",
    );

    expect(result.id).toBe(401);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/delightfulhammers/telesis/pulls/42/comments",
    );
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body.in_reply_to).toBe(300);
    expect(body.body).toBe("[fp] Not a real issue");
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
