import { describe, it, expect } from "vitest";
import type { ReviewFinding, ReviewSession } from "../agent/review/types.js";
import { findingsToReview, driftToComment } from "./adapter.js";
import type { DriftReport } from "../drift/types.js";
import { DRIFT_COMMENT_MARKER } from "./format.js";

const makeSession = (
  overrides: Partial<ReviewSession> = {},
): ReviewSession => ({
  id: "session-1",
  timestamp: "2026-03-11T00:00:00.000Z",
  ref: "origin/main...HEAD",
  files: [{ path: "src/index.ts", status: "modified" }],
  findingCount: 1,
  model: "claude-sonnet-4-6",
  durationMs: 5000,
  tokenUsage: { inputTokens: 1000, outputTokens: 500 },
  mode: "personas",
  personas: ["security"],
  ...overrides,
});

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "finding-1",
  sessionId: "session-1",
  severity: "high",
  category: "bug",
  path: "src/index.ts",
  description: "Null reference possible",
  suggestion: "Add a null check",
  ...overrides,
});

describe("findingsToReview", () => {
  it("converts line-bearing findings to inline comments", () => {
    const findings = [makeFinding({ startLine: 10, endLine: 15 })];
    const result = findingsToReview(makeSession(), findings);

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].path).toBe("src/index.ts");
    expect(result.comments[0].line).toBe(15);
    expect(result.comments[0].startLine).toBe(10);
    expect(result.comments[0].side).toBe("RIGHT");
  });

  it("uses startLine as line when endLine is not set", () => {
    const findings = [makeFinding({ startLine: 10, endLine: undefined })];
    const result = findingsToReview(makeSession(), findings);

    expect(result.comments[0].line).toBe(10);
    expect(result.comments[0].startLine).toBeUndefined();
  });

  it("omits startLine when it equals endLine (single-line comment)", () => {
    const findings = [makeFinding({ startLine: 10, endLine: 10 })];
    const result = findingsToReview(makeSession(), findings);

    expect(result.comments[0].line).toBe(10);
    expect(result.comments[0].startLine).toBeUndefined();
  });

  it("puts no-line findings into the summary body", () => {
    const findings = [
      makeFinding({ startLine: undefined, endLine: undefined }),
    ];
    const result = findingsToReview(makeSession(), findings);

    expect(result.comments).toHaveLength(0);
    expect(result.body).toContain("Null reference possible");
  });

  it("selects REQUEST_CHANGES for critical findings", () => {
    const findings = [makeFinding({ severity: "critical" })];
    const result = findingsToReview(makeSession(), findings);
    expect(result.event).toBe("REQUEST_CHANGES");
  });

  it("selects REQUEST_CHANGES for high findings", () => {
    const findings = [makeFinding({ severity: "high" })];
    const result = findingsToReview(makeSession(), findings);
    expect(result.event).toBe("REQUEST_CHANGES");
  });

  it("selects COMMENT for medium-only findings", () => {
    const findings = [makeFinding({ severity: "medium" })];
    const result = findingsToReview(makeSession(), findings);
    expect(result.event).toBe("COMMENT");
  });

  it("selects COMMENT for low-only findings", () => {
    const findings = [makeFinding({ severity: "low" })];
    const result = findingsToReview(makeSession(), findings);
    expect(result.event).toBe("COMMENT");
  });

  it("selects APPROVE for zero findings", () => {
    const result = findingsToReview(makeSession(), []);
    expect(result.event).toBe("APPROVE");
  });

  it("splits mixed findings into inline and summary", () => {
    const findings = [
      makeFinding({
        id: "f1",
        startLine: 5,
        description: "Inline finding",
      }),
      makeFinding({
        id: "f2",
        startLine: undefined,
        description: "Summary finding",
      }),
    ];
    const result = findingsToReview(makeSession(), findings);

    expect(result.comments).toHaveLength(1);
    expect(result.body).toContain("Summary finding");
    expect(result.body).toContain("1 inline");
    expect(result.body).toContain("1 summary");
  });
});

describe("driftToComment", () => {
  it("returns markdown with drift marker", () => {
    const report: DriftReport = {
      checks: [
        {
          check: "test-colocation",
          passed: true,
          message: "OK",
          severity: "error",
          details: [],
        },
      ],
      passed: true,
      summary: { total: 1, passed: 1, failed: 0, warnings: 0 },
    };

    const result = driftToComment(report);
    expect(result).toContain(DRIFT_COMMENT_MARKER);
    expect(result).toContain("Telesis Drift Report");
  });
});
