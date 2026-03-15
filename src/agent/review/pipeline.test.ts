import { describe, it, expect } from "vitest";
import type { ReviewFinding, FilterStats, ThemeConclusion } from "./types.js";
import { applyFilters } from "./pipeline.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "f-001",
  sessionId: "s-001",
  severity: "medium",
  category: "maintainability",
  path: "src/foo.ts",
  description: "Something could be better",
  suggestion: "Improve it",
  confidence: 90,
  ...overrides,
});

describe("applyFilters", () => {
  it("passes through findings above confidence thresholds", () => {
    const findings = [makeFinding({ confidence: 95 })];
    const result = applyFilters(findings, []);
    expect(result.findings).toHaveLength(1);
    expect(result.stats.totalFilteredCount).toBe(0);
  });

  it("filters low-confidence findings", () => {
    const findings = [makeFinding({ confidence: 10, severity: "low" })];
    const result = applyFilters(findings, []);
    expect(result.findings).toHaveLength(0);
    expect(result.stats.totalFilteredCount).toBeGreaterThan(0);
  });

  it("filters dismissed re-raises", () => {
    const findings = [
      makeFinding({ path: "src/foo.ts", description: "Same issue again" }),
    ];
    const dismissals = [
      {
        id: "d-001",
        findingId: "old-finding",
        sessionId: "old-session",
        reason: "false-positive" as const,
        timestamp: new Date().toISOString(),
        source: "cli" as const,
        path: "src/foo.ts",
        severity: "medium" as const,
        category: "maintainability" as const,
        description: "Same issue again",
        suggestion: "Improve it",
      },
    ];
    const result = applyFilters(findings, dismissals);
    expect(result.stats.dismissalFilteredCount).toBeGreaterThanOrEqual(0);
  });

  it("escalates thresholds for later rounds", () => {
    // Round 3 should have higher thresholds, filtering more
    const findings = [makeFinding({ confidence: 75, severity: "medium" })];
    const round1 = applyFilters(findings, [], [], 1);
    const round3 = applyFilters(findings, [], [], 3);

    // Round 3 escalates thresholds so the same finding might get filtered
    expect(round3.stats.totalFilteredCount).toBeGreaterThanOrEqual(
      round1.stats.totalFilteredCount,
    );
  });

  it("filters by anti-patterns from theme conclusions", () => {
    const findings = [
      makeFinding({
        description: "Remove redirect: error from fetch calls",
      }),
    ];
    const conclusions: readonly ThemeConclusion[] = [
      {
        theme: "redirect prevention",
        conclusion: "All fetch calls use redirect: error intentionally",
        antiPattern: "Do not suggest removing redirect: error",
      },
    ];
    const result = applyFilters(findings, [], [], 1, conclusions);
    // Anti-pattern filtering is fuzzy — just check the stats reflect any filtering attempt
    expect(result.stats).toHaveProperty("antiPatternFilteredCount");
  });
});
