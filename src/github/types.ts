/** Context extracted from GitHub Actions environment for PR operations. */
export interface GitHubPRContext {
  readonly owner: string;
  readonly repo: string;
  readonly pullNumber: number;
  readonly commitSha: string;
  readonly token: string;
}

/** A single inline review comment attached to a PR file. */
export interface PRReviewComment {
  readonly path: string;
  readonly body: string;
  readonly line: number;
  readonly startLine?: number;
  readonly side: "RIGHT";
}

/** Result of posting a PR review via the GitHub API. */
export interface PostReviewResult {
  readonly reviewId: number;
  readonly commentCount: number;
  readonly summaryFindingCount: number;
}

/** Result of posting or updating a PR comment. */
export interface PostCommentResult {
  readonly commentId: number;
}

/** GitHub pull request review event type. */
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

/** A GitHub issue as returned by the REST API (subset of fields we use). */
export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly html_url: string;
  readonly labels: readonly { readonly name: string }[];
  readonly assignee: { readonly login: string } | null;
  readonly pull_request?: unknown;
}
