import { describe, it, expect } from "vitest";
import {
  wordBag,
  jaccardSimilarity,
  findSimilarFinding,
} from "./similarity.js";
import type { ReviewFinding } from "./types.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "f1",
  sessionId: "s1",
  severity: "warning",
  category: "code-quality",
  path: "src/foo.ts",
  startLine: 10,
  endLine: 15,
  description: "Missing error handling in async function",
  suggestion: "Add try-catch block",
  confidence: 0.8,
  persona: "reviewer",
  ...overrides,
});

describe("wordBag", () => {
  it("extracts content-bearing words", () => {
    const bag = wordBag("The quick brown fox is jumping");
    expect(bag).toContain("quick");
    expect(bag).toContain("brown");
    expect(bag).toContain("fox");
    expect(bag).toContain("jumping");
    expect(bag).not.toContain("the");
    expect(bag).not.toContain("is");
  });

  it("strips punctuation", () => {
    const bag = wordBag("error-handling, missing; try/catch");
    expect(bag).toContain("error");
    expect(bag).toContain("handling");
    expect(bag).toContain("missing");
    expect(bag).toContain("try");
    expect(bag).toContain("catch");
  });

  it("lowercases all tokens", () => {
    const bag = wordBag("Missing Error HANDLING");
    expect(bag).toContain("missing");
    expect(bag).toContain("error");
    expect(bag).toContain("handling");
  });

  it("filters single-character tokens", () => {
    const bag = wordBag("a b cd ef");
    expect(bag).not.toContain("b");
    expect(bag).toContain("cd");
    expect(bag).toContain("ef");
  });

  it("returns empty set for empty string", () => {
    expect(wordBag("").size).toBe(0);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const bag = wordBag("error handling missing");
    expect(jaccardSimilarity(bag, bag)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = wordBag("error handling");
    const b = wordBag("performance optimization");
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 1 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("returns 0 when one set is empty", () => {
    const bag = wordBag("error handling");
    expect(jaccardSimilarity(bag, new Set())).toBe(0);
    expect(jaccardSimilarity(new Set(), bag)).toBe(0);
  });

  it("returns partial overlap score", () => {
    const a = wordBag("missing error handling async");
    const b = wordBag("missing error handling sync");
    // intersection: {missing, error, handling} = 3
    // union: {missing, error, handling, async, sync} = 5
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.6, 1);
  });
});

describe("findSimilarFinding", () => {
  it("matches by exact ID", () => {
    const finding = makeFinding({ id: "abc-123" });
    const priors = [
      makeFinding({ id: "abc-123", description: "totally different" }),
    ];

    const match = findSimilarFinding(finding, priors);
    expect(match).not.toBeNull();
    expect(match!.strategy).toBe("exact-id");
    expect(match!.score).toBe(1);
  });

  it("matches by positional proximity", () => {
    const finding = makeFinding({ id: "new-id", startLine: 12 });
    const priors = [makeFinding({ id: "old-id", startLine: 10 })];

    const match = findSimilarFinding(finding, priors);
    expect(match).not.toBeNull();
    expect(match!.strategy).toBe("positional");
  });

  it("rejects positional match beyond threshold", () => {
    const finding = makeFinding({
      id: "new-id",
      startLine: 20,
      description: "completely different text about something else",
    });
    const priors = [
      makeFinding({
        id: "old-id",
        startLine: 10,
        description: "original finding about another topic entirely",
      }),
    ];

    const match = findSimilarFinding(finding, priors);
    expect(match).toBeNull();
  });

  it("matches by description similarity", () => {
    const finding = makeFinding({
      id: "new-id",
      startLine: 50,
      description: "Missing error handling in async function call",
    });
    const priors = [
      makeFinding({
        id: "old-id",
        startLine: 100,
        description: "Missing error handling in async function",
      }),
    ];

    const match = findSimilarFinding(finding, priors);
    expect(match).not.toBeNull();
    expect(match!.strategy).toBe("description");
    expect(match!.score).toBeGreaterThanOrEqual(0.5);
  });

  it("returns null when no match found", () => {
    const finding = makeFinding({
      id: "new-id",
      path: "src/bar.ts",
      description: "completely unrelated issue",
    });
    const priors = [makeFinding({ id: "old-id" })];

    const match = findSimilarFinding(finding, priors);
    expect(match).toBeNull();
  });

  it("returns null for empty priors", () => {
    const match = findSimilarFinding(makeFinding(), []);
    expect(match).toBeNull();
  });

  it("requires same path and category for positional and description match", () => {
    const finding = makeFinding({
      id: "new-id",
      path: "src/foo.ts",
      category: "security",
      startLine: 10,
    });
    const priors = [
      makeFinding({
        id: "old-id",
        path: "src/foo.ts",
        category: "code-quality",
        startLine: 10,
      }),
    ];

    const match = findSimilarFinding(finding, priors);
    expect(match).toBeNull();
  });

  it("prefers exact ID over positional match", () => {
    const finding = makeFinding({ id: "shared-id", startLine: 10 });
    const priors = [
      makeFinding({
        id: "shared-id",
        startLine: 100,
        description: "different",
      }),
      makeFinding({ id: "other-id", startLine: 10 }),
    ];

    const match = findSimilarFinding(finding, priors);
    expect(match!.strategy).toBe("exact-id");
    expect(match!.finding.id).toBe("shared-id");
  });
});
