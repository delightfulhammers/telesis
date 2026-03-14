import type {
  GitHubPRContext,
  GitHubIssue,
  PRReviewComment,
  ReviewEvent,
  PostReviewResult,
  PostCommentResult,
} from "./types.js";
import {
  API_BASE,
  SAFE_NAME_RE,
  GitHubApiError,
  headers,
  fetchWithRetry,
} from "./http.js";

export { GitHubApiError } from "./http.js";

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

const MAX_COMMENT_PAGES = 10;

/**
 * Finds an existing PR comment containing a specific marker string.
 * Returns the comment ID if found, null otherwise.
 *
 * Paginates through comments (100 per page, up to 10 pages) to handle
 * PRs with heavy review activity.
 */
export const findCommentByMarker = async (
  ctx: GitHubPRContext,
  marker: string,
): Promise<number | null> => {
  const baseUrl = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.pullNumber}/comments?per_page=100`;

  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const url = `${baseUrl}&page=${page}`;

    const data = await fetchWithRetry(
      url,
      { method: "GET", headers: headers(ctx.token) },
      "list comments",
    );

    if (!Array.isArray(data)) return null;

    const comments = data as readonly { id: number; body: string }[];
    const match = comments.find((c) => c.body.includes(marker));
    if (match) return match.id;

    // Last page — fewer results than per_page means no more pages
    if (comments.length < 100) break;
  }

  return null;
};

/** Shape of a review comment returned by the GitHub API. */
export interface GitHubReviewComment {
  readonly id: number;
  readonly body: string;
  readonly path: string;
  readonly position: number | null;
  readonly line: number | null;
  readonly in_reply_to_id?: number | null;
}

/**
 * Lists all review comments on a pull request with pagination.
 * Returns inline review comments (not issue comments).
 */
export const listPullRequestReviewComments = async (
  ctx: GitHubPRContext,
): Promise<readonly GitHubReviewComment[]> => {
  const baseUrl = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.pullNumber}/comments?per_page=100`;
  const allComments: GitHubReviewComment[] = [];

  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const url = `${baseUrl}&page=${page}`;

    const data = await fetchWithRetry(
      url,
      { method: "GET", headers: headers(ctx.token) },
      "list review comments",
    );

    if (!Array.isArray(data)) break;

    const comments = data as readonly GitHubReviewComment[];
    allComments.push(...comments);

    if (comments.length < 100) break;
  }

  return allComments;
};

/**
 * Posts a reply to an existing pull request review comment thread.
 * Uses the pull request review comments API (not the issues API).
 */
export const replyToReviewComment = async (
  ctx: GitHubPRContext,
  commentId: number,
  body: string,
): Promise<{ id: number }> => {
  const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.pullNumber}/comments`;

  const data = (await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: headers(ctx.token),
      body: JSON.stringify({ body, in_reply_to: commentId }),
    },
    "reply to review comment",
  )) as { id: number };

  return { id: data.id };
};

/** Parameters for listing repository issues */
export interface ListRepoIssuesParams {
  readonly labels?: string;
  readonly assignee?: string;
  readonly state?: string;
  readonly perPage?: number;
}

const MAX_ISSUE_PAGES = 10;

/**
 * Lists issues for a repository with pagination. Filters out pull requests
 * (items with a `pull_request` key). Paginates up to 10 pages.
 */
export const listRepoIssues = async (
  owner: string,
  repo: string,
  token: string,
  params?: ListRepoIssuesParams,
): Promise<readonly GitHubIssue[]> => {
  if (!SAFE_NAME_RE.test(owner) || !SAFE_NAME_RE.test(repo)) {
    throw new GitHubApiError(
      0,
      "",
      `Invalid owner or repo name: ${owner}/${repo}`,
    );
  }

  const VALID_STATES = new Set(["open", "closed", "all"]);
  const SAFE_LABEL_RE = /^[\w.\- ]+$/;

  const perPage = params?.perPage ?? 100;
  const state = VALID_STATES.has(params?.state ?? "open")
    ? (params?.state ?? "open")
    : "open";
  const allIssues: GitHubIssue[] = [];

  for (let page = 1; page <= MAX_ISSUE_PAGES; page++) {
    const searchParams = new URLSearchParams({
      state,
      per_page: String(perPage),
      page: String(page),
    });

    // User-controlled config inputs — validate before passing to API
    if (params?.labels) {
      const safeLabels = params.labels
        .split(",")
        .filter((l) => SAFE_LABEL_RE.test(l.trim()));
      if (safeLabels.length) searchParams.set("labels", safeLabels.join(","));
    }
    if (params?.assignee && SAFE_NAME_RE.test(params.assignee)) {
      searchParams.set("assignee", params.assignee);
    }

    const url = `${API_BASE}/repos/${owner}/${repo}/issues?${searchParams.toString()}`;

    const data = await fetchWithRetry(
      url,
      { method: "GET", headers: headers(token) },
      "list repo issues",
    );

    if (!Array.isArray(data)) break;

    const issues = (data as readonly GitHubIssue[]).filter(
      (item) => !item.pull_request,
    );
    allIssues.push(...issues);

    if ((data as readonly unknown[]).length < perPage) break;
  }

  return allIssues;
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
