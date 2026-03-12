import type { GitHubPRContext } from "./types.js";
import {
  listPullRequestReviewComments,
  type GitHubReviewComment,
} from "./client.js";
import { FINDING_MARKER_RE } from "./format.js";
import type { DismissalReason } from "../agent/review/dismissal/types.js";
import type {
  DismissalSignal,
  DismissalSource,
} from "../agent/review/dismissal/source.js";

/**
 * Infers a dismissal reason from reply text using bracket-tag conventions.
 * Defaults to "already-addressed" when no explicit tag is present.
 */
export const inferReasonFromText = (text: string): DismissalReason => {
  const lower = text.toLowerCase();
  if (lower.includes("[false-positive]") || lower.includes("[fp]"))
    return "false-positive";
  if (lower.includes("[not-actionable]") || lower.includes("[na]"))
    return "not-actionable";
  if (lower.includes("[style]") || lower.includes("[style-preference]"))
    return "style-preference";
  if (lower.includes("[already-addressed]")) return "already-addressed";
  return "already-addressed";
};

/**
 * Groups review comments into threads. A thread starts with a top-level
 * comment (no in_reply_to_id) and includes all replies.
 */
const groupIntoThreads = (
  comments: readonly GitHubReviewComment[],
): ReadonlyMap<number, readonly GitHubReviewComment[]> => {
  const threads = new Map<number, GitHubReviewComment[]>();

  for (const c of comments) {
    const threadId = c.in_reply_to_id ?? c.id;
    const existing = threads.get(threadId) ?? [];
    existing.push(c);
    threads.set(threadId, existing);
  }

  return threads;
};

/**
 * Strips the finding marker HTML comment from a comment body,
 * returning only the human-readable content.
 */
const stripMarker = (body: string): string =>
  body
    .replace(/<!-- telesis:finding:[\w-]+ -->\n?/g, "")
    .trim();

/**
 * Extracts dismissal signals from GitHub PR review comments.
 *
 * Strategy:
 * 1. Find comments with telesis finding markers
 * 2. Check if the thread has replies (indicating human interaction)
 * 3. If replied to, treat as dismissed and infer reason from reply text
 */
export const extractDismissalSignals = (
  comments: readonly GitHubReviewComment[],
  pullNumber: number,
): readonly DismissalSignal[] => {
  const threads = groupIntoThreads(comments);
  const signals: DismissalSignal[] = [];

  for (const [threadId, threadComments] of threads) {
    // Find the root comment: the thread originator (not a reply) with a finding marker
    const root = threadComments.find(
      (c) => c.in_reply_to_id == null && FINDING_MARKER_RE.test(c.body),
    );
    if (!root) continue;

    const markerMatch = FINDING_MARKER_RE.exec(root.body);
    if (!markerMatch) continue;

    const findingId = markerMatch[1];

    // Look for replies (comments that are not the root)
    const replies = threadComments.filter((c) => c.id !== root.id);
    if (replies.length === 0) continue;

    // Use the last reply to determine the reason
    const lastReply = replies[replies.length - 1];
    const reason = inferReasonFromText(lastReply.body);

    signals.push({
      findingId,
      path: root.path,
      description: stripMarker(root.body),
      reason,
      platformRef: `github:PR#${pullNumber}/thread/${threadId}`,
    });
  }

  return signals;
};

/**
 * GitHub DismissalSource implementation.
 * Fetches review comments from a PR and extracts dismissal signals.
 */
export const createGitHubDismissalSource = (
  ctx: GitHubPRContext,
): DismissalSource => ({
  platform: "github",
  fetchDismissals: async (): Promise<readonly DismissalSignal[]> => {
    const comments = await listPullRequestReviewComments(ctx);
    return extractDismissalSignals(comments, ctx.pullNumber);
  },
});
