import { describe, it, expect } from "vitest";
import { computeDismissalStats, findCandidateNoisePatterns } from "./stats.js";
import type { Dismissal } from "./types.js";

const makeDismissal = (overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: "d1",
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

describe("computeDismissalStats", () => {
  it("returns zero counts for empty dismissals", () => {
    const stats = computeDismissalStats([]);
    expect(stats.total).toBe(0);
    expect(stats.byReason["false-positive"]).toBe(0);
    expect(stats.byCategory.bug).toBe(0);
    expect(stats.bySeverity.high).toBe(0);
    expect(Object.keys(stats.byPersona)).toHaveLength(0);
  });

  it("counts by reason", () => {
    const dismissals = [
      makeDismissal({ reason: "false-positive" }),
      makeDismissal({ reason: "false-positive" }),
      makeDismissal({ reason: "not-actionable" }),
    ];
    const stats = computeDismissalStats(dismissals);
    expect(stats.byReason["false-positive"]).toBe(2);
    expect(stats.byReason["not-actionable"]).toBe(1);
    expect(stats.byReason["already-addressed"]).toBe(0);
  });

  it("counts by category", () => {
    const dismissals = [
      makeDismissal({ category: "bug" }),
      makeDismissal({ category: "security" }),
      makeDismissal({ category: "bug" }),
    ];
    const stats = computeDismissalStats(dismissals);
    expect(stats.byCategory.bug).toBe(2);
    expect(stats.byCategory.security).toBe(1);
    expect(stats.byCategory.architecture).toBe(0);
  });

  it("counts by severity", () => {
    const dismissals = [
      makeDismissal({ severity: "high" }),
      makeDismissal({ severity: "medium" }),
      makeDismissal({ severity: "high" }),
    ];
    const stats = computeDismissalStats(dismissals);
    expect(stats.bySeverity.high).toBe(2);
    expect(stats.bySeverity.medium).toBe(1);
    expect(stats.bySeverity.critical).toBe(0);
  });

  it("counts by persona", () => {
    const dismissals = [
      makeDismissal({ persona: "security" }),
      makeDismissal({ persona: "security" }),
      makeDismissal({ persona: "correctness" }),
      makeDismissal({}), // no persona
    ];
    const stats = computeDismissalStats(dismissals);
    expect(stats.byPersona.security).toBe(2);
    expect(stats.byPersona.correctness).toBe(1);
    expect(Object.keys(stats.byPersona)).toHaveLength(2);
  });

  it("reports correct total", () => {
    const dismissals = [makeDismissal(), makeDismissal(), makeDismissal()];
    expect(computeDismissalStats(dismissals).total).toBe(3);
  });
});

describe("findCandidateNoisePatterns", () => {
  it("returns empty for empty dismissals", () => {
    expect(findCandidateNoisePatterns([])).toEqual([]);
  });

  it("returns empty when fewer than 3 dismissals per reason", () => {
    const dismissals = [
      makeDismissal({ description: "same description phrase here" }),
      makeDismissal({ description: "same description phrase here" }),
    ];
    expect(findCandidateNoisePatterns(dismissals)).toEqual([]);
  });

  it("identifies repeated phrases across 3+ dismissals", () => {
    const dismissals = [
      makeDismissal({ description: "Consider adding null check for safety" }),
      makeDismissal({ description: "Consider adding null check before use" }),
      makeDismissal({
        description: "Consider adding null check to prevent crash",
      }),
    ];
    const patterns = findCandidateNoisePatterns(dismissals);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].count).toBeGreaterThanOrEqual(3);
    expect(patterns[0].reason).toBe("false-positive");
  });

  it("groups patterns by reason", () => {
    const dismissals = [
      makeDismissal({
        reason: "not-actionable",
        description: "This pattern is not actionable here",
      }),
      makeDismissal({
        reason: "not-actionable",
        description: "This pattern is not actionable anywhere",
      }),
      makeDismissal({
        reason: "not-actionable",
        description: "This pattern is not actionable ever",
      }),
    ];
    const patterns = findCandidateNoisePatterns(dismissals);
    for (const p of patterns) {
      expect(p.reason).toBe("not-actionable");
    }
  });

  it("sorts by count descending", () => {
    const base = { reason: "false-positive" as const };
    const dismissals = [
      makeDismissal({
        ...base,
        description: "the common phrase appears right here today",
      }),
      makeDismissal({
        ...base,
        description: "the common phrase appears right here now",
      }),
      makeDismissal({
        ...base,
        description: "the common phrase appears right here again",
      }),
      makeDismissal({
        ...base,
        description: "the common phrase appears right here often",
      }),
    ];
    const patterns = findCandidateNoisePatterns(dismissals);
    for (let i = 1; i < patterns.length; i++) {
      expect(patterns[i].count).toBeLessThanOrEqual(patterns[i - 1].count);
    }
  });
});
