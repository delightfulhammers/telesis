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
      !/\b(when|if|throws|fails|returns|null|undefined|empty|zero|negative|invalid|missing)\b/i.test(
        f.description,
      ),
  },
  {
    name: "low-style",
    test: (f) => f.severity === "low" && f.category === "style",
  },
  {
    name: "self-contradicting",
    test: (f) =>
      /\bactually correct\b/i.test(f.description) ||
      /\bnot wrong\b/i.test(f.description) ||
      /\bis correct but\b/i.test(f.description) ||
      /\bworks correctly\b/i.test(f.description),
  },
  {
    name: "uncited-architecture",
    test: (f) =>
      f.category === "architecture" &&
      /\bper (the |documented )(architecture|convention)/i.test(
        f.description,
      ) &&
      // Keep if a specific file or section is cited
      !/\b[A-Z]+\.(md|ts|yml|yaml|json)\b/.test(f.description) &&
      !/section\s+['"]/i.test(f.description) &&
      !/'[^']+' convention/i.test(f.description),
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
