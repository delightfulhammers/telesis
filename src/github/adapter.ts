import type {
  ReviewFinding,
  ReviewSession,
  FilterStats,
} from "../agent/review/types.js";
import type { DriftReport } from "../drift/types.js";
import type {
  GitHubPRContext,
  PRReviewComment,
  PostReviewResult,
  ReviewEvent,
} from "./types.js";
import {
  formatFindingComment,
  formatReviewSummaryBody,
  formatDriftComment,
  DRIFT_COMMENT_MARKER,
} from "./format.js";
import {
  GitHubApiError,
  postPullRequestReview,
  postPRComment,
  findCommentByMarker,
  updatePRComment,
} from "./client.js";

interface ReviewPayload {
  readonly event: ReviewEvent;
  readonly body: string;
  readonly comments: readonly PRReviewComment[];
}

/**
 * Converts review findings into a GitHub PR review payload.
 *
 * Findings with `startLine` become inline comments on the file.
 * Findings without line info go into the summary body.
 * The review event is determined by the highest severity present.
 */
export const findingsToReview = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  extra?: {
    mergedCount?: number;
    filterStats?: FilterStats;
    estimatedCost?: number | null;
  },
): ReviewPayload => {
  const inlineFindings: ReviewFinding[] = [];
  const summaryFindings: ReviewFinding[] = [];

  for (const f of findings) {
    if (f.startLine !== undefined) {
      inlineFindings.push(f);
    } else {
      summaryFindings.push(f);
    }
  }

  // inlineFindings are guaranteed to have startLine defined (filtered above)
  const comments: PRReviewComment[] = inlineFindings.map((f) => {
    const line = f.endLine ?? (f.startLine as number);
    const comment: PRReviewComment = {
      path: f.path,
      body: formatFindingComment(f),
      line,
      side: "RIGHT" as const,
      ...(f.startLine !== undefined &&
        f.endLine !== undefined &&
        f.startLine !== f.endLine && { startLine: f.startLine }),
    };
    return comment;
  });

  const event = selectEvent(findings);
  const body = formatReviewSummaryBody(
    session,
    inlineFindings,
    summaryFindings,
    extra,
  );

  return { event, body, comments };
};

/**
 * Formats a drift report as a markdown comment body with idempotent marker.
 */
export const driftToComment = (report: DriftReport): string =>
  formatDriftComment(report);

/**
 * Posts review findings as a PR review with inline comments.
 * On 422 (lines outside diff), falls back to posting all findings in the
 * review body as summary entries — no findings are lost.
 */
export const postReviewToGitHub = async (
  ctx: GitHubPRContext,
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  extra?: {
    mergedCount?: number;
    filterStats?: FilterStats;
    estimatedCost?: number | null;
  },
): Promise<PostReviewResult> => {
  const { event, body, comments } = findingsToReview(session, findings, extra);

  try {
    return await postPullRequestReview(ctx, event, body, comments);
  } catch (err) {
    // On 422 with inline comments, re-render with all findings as summary
    if (
      err instanceof GitHubApiError &&
      err.status === 422 &&
      comments.length > 0
    ) {
      console.error(
        `GitHub 422 on review with ${comments.length} inline comments. ` +
          `commit_id: ${ctx.commitSha}. Response: ${err.body}`,
      );
      for (const c of comments) {
        console.error(
          `  Comment: ${c.path}:${c.startLine ?? c.line}-${c.line} (side: ${c.side})`,
        );
      }
      const allAsSummary = formatReviewSummaryBody(
        session,
        [], // no inline findings
        findings, // all findings become summary
        extra,
      );
      const fallbackBody =
        allAsSummary +
        "\n\n_Note: inline comments could not be posted (lines outside diff). All findings shown above._";

      const result = await postPullRequestReview(ctx, event, fallbackBody, []);
      return {
        ...result,
        commentCount: 0,
        summaryFindingCount: findings.length,
      };
    }
    throw err;
  }
};

/**
 * Posts or updates a drift report as an idempotent PR comment.
 * Searches for an existing comment with the drift marker and updates it,
 * or creates a new one if none exists.
 */
export const upsertDriftComment = async (
  ctx: GitHubPRContext,
  report: DriftReport,
): Promise<{ updated: boolean }> => {
  const body = driftToComment(report);
  const existingId = await findCommentByMarker(ctx, DRIFT_COMMENT_MARKER);

  if (existingId) {
    await updatePRComment(ctx, existingId, body);
    return { updated: true };
  }

  await postPRComment(ctx, body);
  return { updated: false };
};

// --- Helpers ---

const selectEvent = (findings: readonly ReviewFinding[]): ReviewEvent => {
  if (findings.length === 0) return "APPROVE";

  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );

  return hasCriticalOrHigh ? "REQUEST_CHANGES" : "COMMENT";
};
