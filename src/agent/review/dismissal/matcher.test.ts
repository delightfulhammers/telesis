import { describe, it, expect } from "vitest";
import { filterDismissedReRaises } from "./matcher.js";
import type { ReviewFinding } from "../types.js";
import type { Dismissal } from "./types.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "finding-001",
  sessionId: "session-001",
  severity: "medium",
  category: "bug",
  path: "src/foo.ts",
  startLine: 42,
  description: "Missing null check on user input",
  suggestion: "Add a null guard",
  confidence: 80,
  ...overrides,
});

const makeDismissal = (overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: "dismissal-001",
  findingId: "dismissed-finding-001",
  sessionId: "old-session",
  reason: "false-positive",
  timestamp: new Date().toISOString(),
  source: "cli",
  path: "src/foo.ts",
  severity: "medium",
  category: "bug",
  description: "Missing null check on user input",
  suggestion: "Add a null guard",
  startLine: 42,
  ...overrides,
});

describe("filterDismissedReRaises", () => {
  it("returns all findings unchanged when dismissals list is empty", () => {
    const findings = [makeFinding(), makeFinding({ id: "finding-002" })];
    const result = filterDismissedReRaises(findings, []);
    expect(result.findings).toHaveLength(2);
    expect(result.filteredCount).toBe(0);
    expect(result.filteredIds).toEqual([]);
  });

  it("filters finding by exact ID match", () => {
    const findings = [makeFinding({ id: "abc-123" })];
    const dismissals = [makeDismissal({ findingId: "abc-123" })];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
    expect(result.filteredIds).toEqual(["abc-123"]);
  });

  it("filters finding by positional match (same path, same category, overlapping lines)", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/foo.ts",
        category: "bug",
        startLine: 44,
        description: "Completely different wording",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    // Dismissal's finding was at line 42, new finding at line 44 — within ±5
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
  });

  it("does NOT match positionally when line difference exceeds ±5", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/foo.ts",
        category: "bug",
        startLine: 100,
        description: "Completely different wording",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(1);
  });

  it("filters finding by description similarity above threshold", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/foo.ts",
        category: "bug",
        startLine: 100, // far from dismissed line, so positional won't match
        description:
          "The user input is missing a null check which could cause errors",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
  });

  it("does NOT match when path differs (even with identical description)", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/bar.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(1);
  });

  it("does NOT match when category differs", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/foo.ts",
        category: "security",
        description: "Missing null check on user input",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(1);
  });

  it("does NOT match when description similarity is below threshold", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/foo.ts",
        category: "bug",
        startLine: 100, // far from dismissed line
        description:
          "The function returns undefined instead of throwing an error for invalid arguments",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(1);
  });

  it("includes filtered finding IDs in filteredIds", () => {
    const findings = [
      makeFinding({ id: "keep-me", path: "src/other.ts" }),
      makeFinding({ id: "filter-me-1" }),
      makeFinding({ id: "filter-me-2" }),
    ];
    const dismissals = [
      makeDismissal({ findingId: "filter-me-1" }),
      makeDismissal({ findingId: "filter-me-2" }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].id).toBe("keep-me");
    expect(result.filteredCount).toBe(2);
    expect(result.filteredIds).toContain("filter-me-1");
    expect(result.filteredIds).toContain("filter-me-2");
  });

  it("handles findings without startLine (no positional match attempted)", () => {
    const findings = [
      makeFinding({
        id: "new-id",
        path: "src/foo.ts",
        category: "bug",
        startLine: undefined,
        description:
          "Completely unrelated issue about performance in the data layer",
      }),
    ];
    const dismissals = [
      makeDismissal({
        findingId: "old-id",
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const result = filterDismissedReRaises(findings, dismissals);
    // No positional match (no startLine), description similarity too low
    expect(result.findings).toHaveLength(1);
  });
});
