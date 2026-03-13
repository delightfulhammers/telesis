import type { ReviewFinding } from "../types.js";
import type { Dismissal } from "./types.js";
import { wordBag, jaccardSimilarity } from "../similarity.js";

export interface MatcherResult {
  readonly findings: readonly ReviewFinding[];
  readonly filteredCount: number;
  readonly filteredIds: readonly string[];
}

const LINE_OVERLAP_THRESHOLD = 5;
const JACCARD_THRESHOLD = 0.5;

/**
 * Checks if a finding's startLine is within ±threshold of a dismissal's
 * startLine. Returns false if either line is undefined — historical
 * dismissals created before startLine was added to the Dismissal type
 * will fall through to description similarity matching (strategy 3).
 */
const linesOverlap = (
  findingLine: number | undefined,
  dismissalLine: number | undefined,
  threshold: number,
): boolean => {
  if (findingLine === undefined || dismissalLine === undefined) return false;
  return Math.abs(findingLine - dismissalLine) <= threshold;
};

/**
 * Deterministic post-review filter that matches new findings against dismissed
 * findings to prevent re-raises. Applied after the noise filter in the pipeline.
 *
 * Three matching strategies (in order of specificity):
 * 1. Exact ID match — finding ID equals a dismissed finding ID
 * 2. Positional match — same path + category + line within ±5
 * 3. Description similarity — same path + category + Jaccard ≥ 0.5
 *
 * Filtered findings are logged to stderr for audit trail.
 */
export const filterDismissedReRaises = (
  findings: readonly ReviewFinding[],
  dismissals: readonly Dismissal[],
): MatcherResult => {
  if (dismissals.length === 0) {
    return { findings, filteredCount: 0, filteredIds: [] };
  }

  // Pre-compute: index dismissals by findingId for exact match
  const dismissalByFindingId = new Map<string, Dismissal>();
  for (const d of dismissals) {
    dismissalByFindingId.set(d.findingId, d);
  }

  // Pre-compute: index dismissals by path+category for positional/description match
  const dismissalsByPathCategory = new Map<string, Dismissal[]>();
  for (const d of dismissals) {
    const key = `${d.path}::${d.category}`;
    const existing = dismissalsByPathCategory.get(key);
    if (existing) {
      existing.push(d);
    } else {
      dismissalsByPathCategory.set(key, [d]);
    }
  }

  // Pre-compute word bags for dismissal descriptions (only for path+category groups)
  const dismissalWordBags = new Map<Dismissal, ReadonlySet<string>>();
  for (const group of dismissalsByPathCategory.values()) {
    for (const d of group) {
      dismissalWordBags.set(d, wordBag(d.description));
    }
  }

  const passed: ReviewFinding[] = [];
  const filteredIds: string[] = [];

  for (const finding of findings) {
    // Strategy 1: Exact ID match
    if (dismissalByFindingId.has(finding.id)) {
      filteredIds.push(finding.id);
      console.error(
        `  Filtered (exact ID): ${finding.path} [${finding.category}] — ${finding.id}`,
      );
      continue;
    }

    // Look up candidates by path+category
    const key = `${finding.path}::${finding.category}`;
    const candidates = dismissalsByPathCategory.get(key);

    if (!candidates || candidates.length === 0) {
      passed.push(finding);
      continue;
    }

    // Strategy 2: Positional match
    const positionalMatch = candidates.some((d) =>
      linesOverlap(finding.startLine, d.startLine, LINE_OVERLAP_THRESHOLD),
    );

    if (positionalMatch) {
      filteredIds.push(finding.id);
      console.error(
        `  Filtered (positional): ${finding.path}:${finding.startLine} [${finding.category}] — ${finding.id}`,
      );
      continue;
    }

    // Strategy 3: Description similarity
    const findingWords = wordBag(finding.description);
    const descriptionMatch = candidates.some((d) => {
      const dWords = dismissalWordBags.get(d);
      if (!dWords) return false;
      return jaccardSimilarity(findingWords, dWords) >= JACCARD_THRESHOLD;
    });

    if (descriptionMatch) {
      filteredIds.push(finding.id);
      console.error(
        `  Filtered (description similarity): ${finding.path} [${finding.category}] — ${finding.id}`,
      );
      continue;
    }

    passed.push(finding);
  }

  return {
    findings: passed,
    filteredCount: filteredIds.length,
    filteredIds,
  };
};
