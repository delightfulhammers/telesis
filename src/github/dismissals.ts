import type { GitHubPRContext } from "./types.js";
import {
  listPullRequestReviewComments,
  type GitHubReviewComment,
} from "./client.js";
import { FINDING_MARKER_RE } from "./format.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import type { Severity, Category } from "../agent/review/types.js";
import { SEVERITIES, CATEGORIES } from "../agent/review/types.js";
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
  body.replace(/<!-- telesis:finding:[\w-]+ -->\n?/g, "").trim();

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
    if (!UUID_RE.test(findingId)) continue;

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
 * Parsed finding metadata extracted from a GitHub review comment body.
 */
export interface ParsedCommentFinding {
  readonly findingId: string;
  readonly path: string;
  readonly severity: Severity;
  readonly category: Category;
  readonly description: string;
  readonly suggestion: string;
  readonly persona?: string;
}

const SEVERITY_CATEGORY_RE = /^\*\*\[(\w+)\]\*\*\s+(\w+)/m;
const SUGGESTION_RE = /^>\s*\*\*Suggestion:\*\*\s*(.+)/m;
const PERSONA_RE = /^_—\s+(.+?)\s+persona_$/m;

/**
 * Parses finding metadata from a GitHub review comment body.
 * Expects the format produced by formatFindingComment.
 */
export const parseCommentFinding = (
  body: string,
  path: string,
): ParsedCommentFinding | null => {
  const markerMatch = FINDING_MARKER_RE.exec(body);
  if (!markerMatch?.[1]) return null;

  const findingId = markerMatch[1];
  if (!UUID_RE.test(findingId)) return null;

  const clean = stripMarker(body);
  const lines = clean.split("\n");

  // First line: **[severity]** category
  const headerMatch = SEVERITY_CATEGORY_RE.exec(lines[0] ?? "");
  if (!headerMatch) return null;

  const rawSeverity = headerMatch[1].toLowerCase();
  const rawCategory = headerMatch[2].toLowerCase();

  const severity = (SEVERITIES as readonly string[]).includes(rawSeverity)
    ? (rawSeverity as Severity)
    : "medium";
  const category = (CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as Category)
    : "bug";

  // Parse remaining lines: description, suggestion, persona
  let suggestion = "";
  let persona: string | undefined;
  const descriptionLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const suggestionMatch = SUGGESTION_RE.exec(line);
    if (suggestionMatch) {
      suggestion = suggestionMatch[1];
      continue;
    }
    const personaMatch = PERSONA_RE.exec(line);
    if (personaMatch) {
      persona = personaMatch[1];
      continue;
    }
    descriptionLines.push(line);
  }

  return {
    findingId,
    path,
    severity,
    category,
    description: descriptionLines.join("\n").trim(),
    suggestion,
    persona,
  };
};

/**
 * Fetches PR review comments and finds a specific finding by ID.
 * Returns parsed metadata or null if not found.
 */
export const findFindingInPR = async (
  ctx: GitHubPRContext,
  findingId: string,
): Promise<ParsedCommentFinding | null> => {
  const comments = await listPullRequestReviewComments(ctx);

  for (const comment of comments) {
    if (!FINDING_MARKER_RE.test(comment.body)) continue;

    const parsed = parseCommentFinding(comment.body, comment.path);
    if (parsed && parsed.findingId === findingId) return parsed;
  }

  return null;
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
