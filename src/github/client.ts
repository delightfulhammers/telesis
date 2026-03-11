import type {
  GitHubPRContext,
  PRReviewComment,
  ReviewEvent,
  PostReviewResult,
  PostCommentResult,
} from "./types.js";

const API_BASE = "https://api.github.com";
const RETRY_DELAY_MS = 2000;

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

const headers = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const handleResponse = async (
  response: Response,
  context: string,
): Promise<unknown> => {
  if (response.ok) return response.json();

  const body = await response.text();

  if (response.status === 403) {
    throw new GitHubApiError(
      403,
      body,
      `GitHub API permission denied (${context}). ` +
        "Ensure GITHUB_TOKEN has 'pull-requests: write' permission. " +
        `Response: ${body}`,
    );
  }

  throw new GitHubApiError(
    response.status,
    body,
    `GitHub API error ${response.status} (${context}): ${body}`,
  );
};

/**
 * Fetch with a single retry on 5xx. Uses a flat delay (not exponential)
 * because we only retry once. Only safe with string bodies — do not use
 * with ReadableStream request bodies.
 */
const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  context: string,
): Promise<unknown> => {
  // Disable redirects to prevent leaking the Authorization header to third-party hosts
  const opts: RequestInit = { ...init, redirect: "error" };
  const response = await fetch(url, opts);

  if (response.status >= 500) {
    // Drain the failed response body to release the connection
    await response.text();
    await sleep(RETRY_DELAY_MS);
    const retry = await fetch(url, opts);
    return handleResponse(retry, context);
  }

  return handleResponse(response, context);
};

/**
 * Posts a pull request review with optional inline comments.
 * Throws GitHubApiError on failure (including 422 for out-of-diff lines).
 * The adapter layer handles 422 fallback by re-rendering findings as summary.
 */
export const postPullRequestReview = async (
  ctx: GitHubPRContext,
  event: ReviewEvent,
  body: string,
  comments: readonly PRReviewComment[],
): Promise<PostReviewResult> => {
  const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.pullNumber}/reviews`;

  const requestBody = {
    commit_id: ctx.commitSha,
    event,
    body,
    comments: comments.map((c) => ({
      path: c.path,
      body: c.body,
      line: c.line,
      ...(c.startLine !== undefined && { start_line: c.startLine }),
      side: c.side,
    })),
  };

  const data = (await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: headers(ctx.token),
      body: JSON.stringify(requestBody),
    },
    "post review",
  )) as { id: number };

  return {
    reviewId: data.id,
    commentCount: comments.length,
    summaryFindingCount: 0,
  };
};

/**
 * Posts a comment on a PR (via the issues API).
 */
export const postPRComment = async (
  ctx: GitHubPRContext,
  body: string,
): Promise<PostCommentResult> => {
  const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.pullNumber}/comments`;

  const data = (await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: headers(ctx.token),
      body: JSON.stringify({ body }),
    },
    "post comment",
  )) as { id: number };

  return { commentId: data.id };
};

/**
 * Finds an existing PR comment containing a specific marker string.
 * Returns the comment ID if found, null otherwise.
 *
 * Note: only searches the first 100 comments. PRs with 100+ comments
 * may get a duplicate drift comment instead of an update. Pagination is
 * not implemented because this scenario is extremely rare in practice.
 */
export const findCommentByMarker = async (
  ctx: GitHubPRContext,
  marker: string,
): Promise<number | null> => {
  const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.pullNumber}/comments?per_page=100`;

  const data = await fetchWithRetry(
    url,
    { method: "GET", headers: headers(ctx.token) },
    "list comments",
  );

  if (!Array.isArray(data)) return null;

  const comments = data as readonly { id: number; body: string }[];
  const match = comments.find((c) => c.body.includes(marker));
  return match?.id ?? null;
};

/**
 * Updates an existing PR comment by ID.
 */
export const updatePRComment = async (
  ctx: GitHubPRContext,
  commentId: number,
  body: string,
): Promise<PostCommentResult> => {
  const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/comments/${commentId}`;

  const data = (await fetchWithRetry(
    url,
    {
      method: "PATCH",
      headers: headers(ctx.token),
      body: JSON.stringify({ body }),
    },
    "update comment",
  )) as { id: number };

  return { commentId: data.id };
};
