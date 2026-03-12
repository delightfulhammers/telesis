import type { Dismissal, DismissalReason } from "./types.js";
import type { Severity, Category } from "../types.js";

export interface DismissalStats {
  readonly total: number;
  readonly byReason: Record<DismissalReason, number>;
  readonly byCategory: Record<Category, number>;
  readonly bySeverity: Record<Severity, number>;
  readonly byPersona: Record<string, number>;
}

export interface CandidateNoisePattern {
  readonly substring: string;
  readonly count: number;
  readonly reason: DismissalReason;
}

const emptyReasonCounts = (): Record<DismissalReason, number> => ({
  "false-positive": 0,
  "not-actionable": 0,
  "already-addressed": 0,
  "style-preference": 0,
});

const emptyCategoryCounts = (): Record<Category, number> => ({
  bug: 0,
  security: 0,
  architecture: 0,
  maintainability: 0,
  performance: 0,
  style: 0,
});

const emptySeverityCounts = (): Record<Severity, number> => ({
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
});

export const computeDismissalStats = (
  dismissals: readonly Dismissal[],
): DismissalStats => {
  const byReason = emptyReasonCounts();
  const byCategory = emptyCategoryCounts();
  const bySeverity = emptySeverityCounts();
  const byPersona: Record<string, number> = {};

  for (const d of dismissals) {
    byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
    if (d.persona) {
      byPersona[d.persona] = (byPersona[d.persona] ?? 0) + 1;
    }
  }

  return {
    total: dismissals.length,
    byReason,
    byCategory,
    bySeverity,
    byPersona,
  };
};

const MIN_PATTERN_OCCURRENCES = 3;
const MIN_SUBSTRING_LENGTH = 10;

/**
 * Finds description substrings that recur across 3+ dismissals with the
 * same reason. Deterministic — no model calls. Uses word-boundary-aware
 * substring extraction (splits on sentence segments).
 */
export const findCandidateNoisePatterns = (
  dismissals: readonly Dismissal[],
): readonly CandidateNoisePattern[] => {
  // Group by reason
  const byReason = new Map<DismissalReason, readonly Dismissal[]>();
  for (const d of dismissals) {
    const existing = byReason.get(d.reason);
    if (existing) {
      (existing as Dismissal[]).push(d);
    } else {
      byReason.set(d.reason, [d]);
    }
  }

  const patterns: CandidateNoisePattern[] = [];

  for (const [reason, group] of byReason) {
    if (group.length < MIN_PATTERN_OCCURRENCES) continue;

    // Extract significant phrases from descriptions
    const descriptions = group.map((d) => d.description.toLowerCase());

    // Find common substrings by splitting each description into n-grams
    // and counting occurrences across descriptions
    const phraseCounts = new Map<string, number>();

    for (const desc of descriptions) {
      // Split into word sequences of 3-6 words
      const words = desc.split(/\s+/).filter((w) => w.length > 0);
      const seen = new Set<string>();

      for (let len = 3; len <= Math.min(6, words.length); len++) {
        for (let i = 0; i <= words.length - len; i++) {
          const phrase = words.slice(i, i + len).join(" ");
          if (phrase.length < MIN_SUBSTRING_LENGTH) continue;
          if (seen.has(phrase)) continue;
          seen.add(phrase);
          phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
        }
      }
    }

    // Surface phrases that appear in 3+ dismissals
    for (const [phrase, count] of phraseCounts) {
      if (count >= MIN_PATTERN_OCCURRENCES) {
        patterns.push({ substring: phrase, count, reason });
      }
    }
  }

  // Sort by count descending, then alphabetically
  patterns.sort((a, b) =>
    a.count !== b.count
      ? b.count - a.count
      : a.substring.localeCompare(b.substring),
  );

  return patterns;
};
