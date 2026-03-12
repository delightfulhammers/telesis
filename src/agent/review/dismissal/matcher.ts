import type { ReviewFinding } from "../types.js";
import type { Dismissal } from "./types.js";

export interface MatcherResult {
  readonly findings: readonly ReviewFinding[];
  readonly filteredCount: number;
  readonly filteredIds: readonly string[];
}

const LINE_OVERLAP_THRESHOLD = 5;
const JACCARD_THRESHOLD = 0.5;

/**
 * Extracts a word bag (set of lowercase tokens) from text for Jaccard comparison.
 * Strips punctuation and common stop words to focus on content-bearing terms.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "and",
  "or",
  "but",
  "not",
  "it",
  "its",
  "this",
  "that",
  "which",
  "as",
  "if",
  "could",
  "should",
  "would",
  "can",
  "may",
  "might",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
]);

const wordBag = (text: string): ReadonlySet<string> => {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  return new Set(words);
};

/**
 * Computes Jaccard similarity between two word bags: |A ∩ B| / |A ∪ B|.
 */
const jaccardSimilarity = (
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number => {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;

  for (const word of smaller) {
    if (larger.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

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
