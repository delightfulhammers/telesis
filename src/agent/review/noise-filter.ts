import type { ReviewFinding } from "./types.js";

export interface FilterResult {
  readonly findings: readonly ReviewFinding[];
  readonly filteredCount: number;
  readonly filteredReasons: Record<string, number>;
}

interface NoisePattern {
  readonly name: string;
  readonly test: (finding: ReviewFinding) => boolean;
}

const NOISE_PATTERNS: readonly NoisePattern[] = [
  {
    name: "hedging",
    test: (f) =>
      /\bthis is correct\b/i.test(f.description) ||
      /\bthe code correctly\b/i.test(f.description),
  },
  {
    name: "self-dismissing",
    test: (f) =>
      /\bno action needed\b/i.test(f.description) ||
      /\bthis is fine\b/i.test(f.description) ||
      /\bnot necessarily a problem\b/i.test(f.description),
  },
  {
    name: "vague-speculation",
    test: (f) =>
      /\bconsider whether\b/i.test(f.description) &&
      // Keep if there's a concrete scenario: mentions specific inputs, errors,
      // conditions, or technical terms after the speculative framing
      !/\b(when|if|for|throws|fails|returns|null|undefined|empty|zero|negative|invalid|missing)\b/i.test(
        f.description,
      ),
  },
  {
    name: "low-style",
    test: (f) => f.severity === "low" && f.category === "style",
  },
];

/**
 * Deterministic post-filter that catches noise patterns the model emits
 * despite prompt guidance. Cheap regex-based filter applied after dedup
 * and before display.
 */
export const filterNoise = (
  findings: readonly ReviewFinding[],
): FilterResult => {
  const passed: ReviewFinding[] = [];
  const filteredReasons: Record<string, number> = {};
  let filteredCount = 0;

  for (const f of findings) {
    const matchedPattern = NOISE_PATTERNS.find((p) => p.test(f));
    if (matchedPattern) {
      filteredCount++;
      filteredReasons[matchedPattern.name] =
        (filteredReasons[matchedPattern.name] ?? 0) + 1;
    } else {
      passed.push(f);
    }
  }

  return { findings: passed, filteredCount, filteredReasons };
};
