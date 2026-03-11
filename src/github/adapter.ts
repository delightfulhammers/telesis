import type { ReviewFinding, ReviewSession } from "../agent/review/types.js";
import type { DriftReport } from "../drift/types.js";
import type { PRReviewComment, ReviewEvent } from "./types.js";
import {
  formatFindingComment,
  formatReviewSummaryBody,
  formatDriftComment,
} from "./format.js";

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
  extra?: { mergedCount?: number },
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

// --- Helpers ---

const selectEvent = (findings: readonly ReviewFinding[]): ReviewEvent => {
  if (findings.length === 0) return "APPROVE";

  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );

  return hasCriticalOrHigh ? "REQUEST_CHANGES" : "COMMENT";
};
