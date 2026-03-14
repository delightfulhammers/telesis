import type { ReviewFinding, ReviewSession, ChangedFile } from "./types.js";
import { findSimilarFinding } from "./similarity.js";
import type { SimilarityMatch } from "./similarity.js";
import { listReviewSessions, loadReviewSession } from "./store.js";

// Jaccard ≥ 0.5 requires majority overlap. For a 2-file diff that
// gains 1 file: {A,B} vs {A,B,C} → Jaccard = 2/3 ≈ 0.67 → match.
// For completely disjoint sets: {A} vs {B} → 0 → no match.
// Lower values (0.2-0.3) would treat any shared file as sufficient;
// 0.5 avoids false chains when a single common utility file appears
// in otherwise unrelated reviews.
const FILE_OVERLAP_THRESHOLD = 0.5;

/**
 * Computes Jaccard similarity between two file path sets.
 * Used to prevent sessions reviewing disjoint file sets from being
 * treated as the same review chain (e.g., two "staged changes" reviews
 * that happen to share the same ref string but cover different files).
 */
const fileSetOverlap = (
  a: readonly ChangedFile[],
  b: readonly ChangedFile[],
): number => {
  const setA = new Set(a.map((f) => f.path));
  const setB = new Set(b.map((f) => f.path));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  for (const path of smaller) {
    if (larger.has(path)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

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
  readonly recurringRatio: number;
  readonly plateauDetected: boolean;
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
  currentFiles?: readonly ChangedFile[],
): readonly ReviewFinding[] => {
  const allSessions = sessions ?? listReviewSessions(rootDir);

  // Find the most recent session with the same ref, excluding the current one
  const priorSession = allSessions.find(
    (s) =>
      s.ref === ref &&
      s.id !== currentSessionId &&
      (!currentFiles ||
        fileSetOverlap(s.files, currentFiles) >= FILE_OVERLAP_THRESHOLD),
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
  const recurringRatio = totalCount > 0 ? persistentCount / totalCount : 0;
  const plateauDetected = round >= 3 && recurringRatio >= 0.8;

  return {
    round,
    newCount,
    persistentCount,
    resolvedCount,
    totalCount,
    converged: totalCount === 0,
    recurringRatio,
    plateauDetected,
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
  currentFiles?: readonly ChangedFile[],
): readonly ReviewSession[] => {
  const allSessions = sessions ?? listReviewSessions(rootDir);
  return allSessions.filter(
    (s) =>
      s.ref === ref &&
      s.id !== currentSessionId &&
      (!currentFiles ||
        fileSetOverlap(s.files, currentFiles) >= FILE_OVERLAP_THRESHOLD),
  );
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

  const line = parts.join(" ");

  if (summary.plateauDetected) {
    return `${line}\nReview has plateaued — 80%+ of findings are recurring. Consider dismissing or stopping.`;
  }

  return line;
};
