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

  it("filters vague 'consider whether' with common preposition 'for'", () => {
    const findings = [
      makeFinding({
        description: "Consider whether this could be improved for performance",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["vague-speculation"]).toBe(1);
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

  // --- Self-contradicting patterns ---

  it("filters self-contradicting — 'actually correct'", () => {
    const findings = [
      makeFinding({
        description:
          "The logic is actually correct for path traversal prevention, but could use path.relative()",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-contradicting"]).toBe(1);
  });

  it("filters self-contradicting — 'not wrong'", () => {
    const findings = [
      makeFinding({
        description:
          "The override is redundant but not wrong. The real issue is...",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-contradicting"]).toBe(1);
  });

  it("filters self-contradicting — 'is correct but'", () => {
    const findings = [
      makeFinding({
        description:
          "The approach is correct but could be simplified using a helper",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-contradicting"]).toBe(1);
  });

  it("filters self-contradicting — 'works correctly'", () => {
    const findings = [
      makeFinding({
        description:
          "The function works correctly, however the naming could be improved",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["self-contradicting"]).toBe(1);
  });

  it("keeps findings that discuss correctness of something else", () => {
    const findings = [
      makeFinding({
        description:
          "The null check is missing — the caller does not correctly validate the input",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  // --- Uncited architecture findings ---

  it("filters architecture findings citing vague authority", () => {
    const findings = [
      makeFinding({
        category: "architecture",
        description:
          "Per the architecture, business logic should not live in the CLI layer",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["uncited-architecture"]).toBe(1);
  });

  it("filters architecture findings with 'per documented conventions'", () => {
    const findings = [
      makeFinding({
        category: "architecture",
        description:
          "Per documented conventions, this import creates coupling between packages",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredReasons["uncited-architecture"]).toBe(1);
  });

  it("keeps architecture findings that cite a specific file", () => {
    const findings = [
      makeFinding({
        category: "architecture",
        description:
          "Per ARCHITECTURE.md section 'Package discipline', src/cli/ should not import from agent internals",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("keeps architecture findings that cite a specific section", () => {
    const findings = [
      makeFinding({
        category: "architecture",
        description:
          "Violates the 'Model calls' convention in CLAUDE.md — direct SDK import outside client.ts",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });

  it("does not apply uncited-architecture filter to non-architecture findings", () => {
    const findings = [
      makeFinding({
        category: "bug",
        description:
          "Per the architecture, this should not happen, but the null check is missing",
      }),
    ];
    const result = filterNoise(findings);
    expect(result.findings).toHaveLength(1);
  });
});
