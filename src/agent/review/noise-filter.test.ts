import { describe, it, expect } from "vitest";
import { filterNoise } from "./noise-filter.js";
import type { ReviewFinding } from "./types.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "test-id",
  sessionId: "test-session",
  severity: "medium",
  category: "bug",
  path: "src/foo.ts",
  description: "A real issue",
  suggestion: "Fix it",
  confidence: 80,
  ...overrides,
});

describe("filterNoise", () => {
  it("passes through legitimate findings unchanged", () => {
    const findings = [
      makeFinding({ description: "Missing null check on user input" }),
      makeFinding({ description: "SQL injection via unsanitized parameter" }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(2);
    expect(result.filteredCount).toBe(0);
    expect(result.filteredReasons).toEqual({});
  });

  it("filters hedging — 'This is correct'", () => {
    const findings = [
      makeFinding({
        description: "This is correct, but consider adding a fallback",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
    expect(result.filteredReasons.hedging).toBe(1);
  });

  it("filters hedging — 'The code correctly'", () => {
    const findings = [
      makeFinding({
        description:
          "The code correctly handles the error, but could log more detail",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons.hedging).toBe(1);
  });

  it("filters self-dismissing — 'no action needed'", () => {
    const findings = [
      makeFinding({
        description: "The function signature is fine, no action needed",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-dismissing"]).toBe(1);
  });

  it("filters self-dismissing — 'this is fine'", () => {
    const findings = [
      makeFinding({
        description: "The error handling here is okay, this is fine as-is",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-dismissing"]).toBe(1);
  });

  it("filters self-dismissing — 'not necessarily a problem'", () => {
    const findings = [
      makeFinding({
        description:
          "Using string concatenation is not necessarily a problem here",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-dismissing"]).toBe(1);
  });

  it("filters vague speculation — 'consider whether' without concrete scenario", () => {
    const findings = [
      makeFinding({
        description: "Consider whether this could be improved",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["vague-speculation"]).toBe(1);
  });

  it("keeps 'consider whether' with concrete scenario using 'when'", () => {
    const findings = [
      makeFinding({
        description:
          "Consider whether this fails when the user passes an empty string",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("keeps 'consider whether' with concrete scenario using 'throws'", () => {
    const findings = [
      makeFinding({
        description: "Consider whether this throws for null inputs",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("keeps 'consider whether' with concrete scenario using 'if'", () => {
    const findings = [
      makeFinding({
        description: "Consider whether this fails if the input is empty",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("filters low-severity style findings", () => {
    const findings = [
      makeFinding({
        severity: "low",
        category: "style",
        description: "Variable name could be more descriptive",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["low-style"]).toBe(1);
  });

  it("keeps medium-severity style findings", () => {
    const findings = [
      makeFinding({
        severity: "medium",
        category: "style",
        description: "Violates documented naming convention XYZ",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("keeps low-severity non-style findings", () => {
    const findings = [
      makeFinding({
        severity: "low",
        category: "bug",
        description: "Minor edge case in parsing",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("counts multiple filter reasons accurately", () => {
    const findings = [
      makeFinding({
        description: "This is correct, but consider refactoring",
      }),
      makeFinding({
        description: "No action needed for this import",
      }),
      makeFinding({
        severity: "low",
        category: "style",
        description: "Naming preference",
      }),
      makeFinding({
        description: "Real bug: missing validation",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(3);
    expect(result.filteredReasons.hedging).toBe(1);
    expect(result.filteredReasons["self-dismissing"]).toBe(1);
    expect(result.filteredReasons["low-style"]).toBe(1);
  });

  it("returns empty result for empty input", () => {
    const result = filterNoise([]);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(0);
    expect(result.filteredReasons).toEqual({});
  });
});
