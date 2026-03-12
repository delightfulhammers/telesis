import { describe, it, expect } from "vitest";
import { formatDismissalList, formatDismissalStats } from "./format.js";
import type { Dismissal } from "./types.js";
import type { DismissalStats, CandidateNoisePattern } from "./stats.js";

const makeDismissal = (overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: "d0000000-0000-0000-0000-000000000001",
  findingId: "f1",
  sessionId: "s1",
  reason: "false-positive",
  timestamp: "2026-03-10T12:00:00Z",
  source: "cli",
  path: "src/foo.ts",
  severity: "high",
  category: "bug",
  description: "Null check missing",
  suggestion: "Add null check",
  ...overrides,
});

describe("formatDismissalList", () => {
  it("returns message for empty list", () => {
    expect(formatDismissalList([])).toBe("No dismissals found.");
  });

  it("formats dismissals with date, short id, path, severity/category, reason", () => {
    const result = formatDismissalList([makeDismissal()]);
    expect(result).toContain("2026-03-10");
    expect(result).toContain("d0000000");
    expect(result).toContain("src/foo.ts");
    expect(result).toContain("[high/bug]");
    expect(result).toContain("false-positive");
  });

  it("includes persona when present", () => {
    const result = formatDismissalList([
      makeDismissal({ persona: "security" }),
    ]);
    expect(result).toContain("(security)");
  });

  it("formats multiple dismissals as separate lines", () => {
    const result = formatDismissalList([
      makeDismissal({ id: "d1000000-0000-0000-0000-000000000001" }),
      makeDismissal({ id: "d2000000-0000-0000-0000-000000000002" }),
    ]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
  });
});

describe("formatDismissalStats", () => {
  it("returns message when total is zero", () => {
    const stats: DismissalStats = {
      total: 0,
      byReason: {
        "false-positive": 0,
        "not-actionable": 0,
        "already-addressed": 0,
        "style-preference": 0,
      },
      byCategory: {
        bug: 0,
        security: 0,
        architecture: 0,
        maintainability: 0,
        performance: 0,
        style: 0,
      },
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byPersona: {},
    };
    expect(formatDismissalStats(stats, [])).toBe("No dismissals to analyze.");
  });

  it("includes reason, category, severity sections", () => {
    const stats: DismissalStats = {
      total: 3,
      byReason: {
        "false-positive": 2,
        "not-actionable": 1,
        "already-addressed": 0,
        "style-preference": 0,
      },
      byCategory: {
        bug: 3,
        security: 0,
        architecture: 0,
        maintainability: 0,
        performance: 0,
        style: 0,
      },
      bySeverity: { critical: 0, high: 2, medium: 1, low: 0 },
      byPersona: {},
    };
    const result = formatDismissalStats(stats, []);
    expect(result).toContain("By Reason:");
    expect(result).toContain("false-positive: 2");
    expect(result).toContain("By Category:");
    expect(result).toContain("bug: 3");
    expect(result).toContain("By Severity:");
    expect(result).toContain("high: 2");
  });

  it("includes persona section when present", () => {
    const stats: DismissalStats = {
      total: 2,
      byReason: {
        "false-positive": 2,
        "not-actionable": 0,
        "already-addressed": 0,
        "style-preference": 0,
      },
      byCategory: {
        bug: 2,
        security: 0,
        architecture: 0,
        maintainability: 0,
        performance: 0,
        style: 0,
      },
      bySeverity: { critical: 0, high: 2, medium: 0, low: 0 },
      byPersona: { security: 1, correctness: 1 },
    };
    const result = formatDismissalStats(stats, []);
    expect(result).toContain("By Persona:");
    expect(result).toContain("security: 1");
  });

  it("includes noise patterns when present", () => {
    const stats: DismissalStats = {
      total: 5,
      byReason: {
        "false-positive": 5,
        "not-actionable": 0,
        "already-addressed": 0,
        "style-preference": 0,
      },
      byCategory: {
        bug: 5,
        security: 0,
        architecture: 0,
        maintainability: 0,
        performance: 0,
        style: 0,
      },
      bySeverity: { critical: 0, high: 5, medium: 0, low: 0 },
      byPersona: {},
    };
    const patterns: CandidateNoisePattern[] = [
      {
        substring: "null check missing here",
        count: 4,
        reason: "false-positive",
      },
    ];
    const result = formatDismissalStats(stats, patterns);
    expect(result).toContain("Candidate Noise Patterns:");
    expect(result).toContain("null check missing here");
    expect(result).toContain("4 occurrences");
  });
});
