import type { ReviewFinding } from "./types.js";

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

/**
 * Extracts a word bag (set of lowercase tokens) from text for Jaccard comparison.
 * Strips punctuation and common stop words to focus on content-bearing terms.
 */
export const wordBag = (text: string): ReadonlySet<string> => {
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
export const jaccardSimilarity = (
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

const LINE_OVERLAP_THRESHOLD = 5;
const JACCARD_THRESHOLD = 0.5;

export interface SimilarityMatch {
  readonly finding: ReviewFinding;
  readonly strategy: "exact-id" | "positional" | "description";
  readonly score: number;
}

/**
 * Find the best match for a finding in a set of prior findings.
 * Uses three strategies in order of specificity:
 * 1. Exact ID match
 * 2. Positional match — same path + category + line within ±5
 * 3. Description similarity — same path + category + Jaccard ≥ 0.5
 *
 * Returns null if no match meets the threshold.
 */
export const findSimilarFinding = (
  finding: ReviewFinding,
  priors: readonly ReviewFinding[],
): SimilarityMatch | null => {
  // Strategy 1: Exact ID
  const exactMatch = priors.find((p) => p.id === finding.id);
  if (exactMatch) {
    return { finding: exactMatch, strategy: "exact-id", score: 1 };
  }

  // Filter to same path + category candidates
  const candidates = priors.filter(
    (p) => p.path === finding.path && p.category === finding.category,
  );

  if (candidates.length === 0) return null;

  // Strategy 2: Positional match
  if (finding.startLine !== undefined) {
    const positional = candidates.find(
      (c) =>
        c.startLine !== undefined &&
        Math.abs(finding.startLine! - c.startLine) <= LINE_OVERLAP_THRESHOLD,
    );
    if (positional) {
      return { finding: positional, strategy: "positional", score: 0.8 };
    }
  }

  // Strategy 3: Description similarity
  const findingWords = wordBag(finding.description);
  let bestMatch: ReviewFinding | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = jaccardSimilarity(
      findingWords,
      wordBag(candidate.description),
    );
    if (score >= JACCARD_THRESHOLD && score > bestScore) {
      bestMatch = candidate;
      bestScore = score;
    }
  }

  if (bestMatch) {
    return { finding: bestMatch, strategy: "description", score: bestScore };
  }

  return null;
};
