import type { ReviewFinding, ReviewSession } from "./types.js";
import { findSimilarFinding } from "./similarity.js";
import type { SimilarityMatch } from "./similarity.js";
import { listReviewSessions, loadReviewSession } from "./store.js";

// --- Labeled Finding ---

export type FindingLabel = "new" | "persistent" | "resolved";

export interface LabeledFinding {
  readonly finding: ReviewFinding;
  readonly label: FindingLabel;
  readonly priorMatch?: SimilarityMatch;
}

// --- Convergence Summary ---

export interface ConvergenceSummary {
  readonly round: number;
  readonly newCount: number;
  readonly persistentCount: number;
  readonly resolvedCount: number;
  readonly totalCount: number;
  readonly converged: boolean;
}

// --- Cross-round Matching ---

/**
 * Load findings from the single most recent prior session for the same ref.
 * Only the immediately preceding round is compared — 'persistent' means
 * 'present in the immediately preceding round', not across all history.
 * Returns empty array if no prior session exists.
 */
export const loadPriorFindings = (
  rootDir: string,
  ref: string,
  currentSessionId: string,
  sessions?: readonly ReviewSession[],
): readonly ReviewFinding[] => {
  const allSessions = sessions ?? listReviewSessions(rootDir);

  // Find the most recent session with the same ref, excluding the current one
  const priorSession = allSessions.find(
    (s) => s.ref === ref && s.id !== currentSessionId,
  );

  if (!priorSession) return [];

  try {
    const { findings } = loadReviewSession(rootDir, priorSession.id);
    return findings;
  } catch {
    return [];
  }
};

/**
 * Label each finding as new, persistent, or resolved by comparing against
 * prior findings from the previous review round.
 *
 * - "new" — not found in priors
 * - "persistent" — matched a prior finding (survived a fix attempt)
 * - "resolved" — a prior finding not matched by any current finding
 *
 * If multiple current findings match the same prior, only the first is
 * labeled persistent; subsequent matches are labeled new.
 *
 * Returns labeled current findings plus resolved prior findings.
 */
export const labelFindings = (
  current: readonly ReviewFinding[],
  priors: readonly ReviewFinding[],
): readonly LabeledFinding[] => {
  if (priors.length === 0) {
    return current.map((finding) => ({ finding, label: "new" as const }));
  }

  const matchedPriorIds = new Set<string>();
  const labeled: LabeledFinding[] = [];

  // Label current findings
  for (const finding of current) {
    const match = findSimilarFinding(finding, priors);
    if (match && !matchedPriorIds.has(match.finding.id)) {
      matchedPriorIds.add(match.finding.id);
      labeled.push({ finding, label: "persistent", priorMatch: match });
    } else {
      labeled.push({ finding, label: "new" });
    }
  }

  // Identify resolved findings (in priors but not matched by current)
  for (const prior of priors) {
    if (!matchedPriorIds.has(prior.id)) {
      labeled.push({ finding: prior, label: "resolved" });
    }
  }

  return labeled;
};

/**
 * Compute convergence summary from labeled findings.
 * Convergence is achieved when there are no new findings and no persistent findings.
 */
export const summarizeConvergence = (
  labeled: readonly LabeledFinding[],
  priorSessions: readonly ReviewSession[],
): ConvergenceSummary => {
  const newCount = labeled.filter((l) => l.label === "new").length;
  const persistentCount = labeled.filter(
    (l) => l.label === "persistent",
  ).length;
  const resolvedCount = labeled.filter((l) => l.label === "resolved").length;
  const totalCount = newCount + persistentCount;
  const round = priorSessions.length + 1;

  return {
    round,
    newCount,
    persistentCount,
    resolvedCount,
    totalCount,
    converged: totalCount === 0,
  };
};

/**
 * List prior review sessions for the same git ref, ordered newest first.
 */
export const listPriorSessions = (
  rootDir: string,
  ref: string,
  currentSessionId: string,
  sessions?: readonly ReviewSession[],
): readonly ReviewSession[] => {
  const allSessions = sessions ?? listReviewSessions(rootDir);
  return allSessions.filter((s) => s.ref === ref && s.id !== currentSessionId);
};

/**
 * Format a convergence summary as a human-readable string.
 */
export const formatConvergenceSummary = (
  summary: ConvergenceSummary,
): string => {
  if (summary.converged) {
    return `Round ${summary.round}: Converged — all prior findings resolved, no new findings.`;
  }

  const parts: string[] = [`Round ${summary.round}:`];

  if (summary.newCount > 0) {
    parts.push(`${summary.newCount} new`);
  }
  if (summary.persistentCount > 0) {
    parts.push(`${summary.persistentCount} persistent`);
  }
  if (summary.resolvedCount > 0) {
    parts.push(`${summary.resolvedCount} resolved`);
  }

  return parts.join(" ");
};
