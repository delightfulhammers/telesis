import { describe, it, expect } from "vitest";
import {
  formatReviewReport,
  formatSessionList,
  filterBySeverity,
} from "./format.js";
import type { ReviewSession, ReviewFinding } from "./types.js";

const makeSession = (
  overrides: Partial<ReviewSession> = {},
): ReviewSession => ({
  id: "abc12345-6789-0000-0000-000000000000",
  timestamp: "2026-03-10T12:00:00Z",
  ref: "staged changes",
  files: [{ path: "src/foo.ts", status: "modified" }],
  findingCount: 0,
  model: "claude-sonnet-4-6",
  durationMs: 2300,
  tokenUsage: { inputTokens: 1000, outputTokens: 200 },
  ...overrides,
});

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "finding-1",
  sessionId: "session-1",
  severity: "high",
  category: "bug",
  path: "src/foo.ts",
  startLine: 10,
  endLine: 15,
  description: "Null check missing",
  suggestion: "Add a null check before accessing the property",
  ...overrides,
});

describe("formatReviewReport", () => {
  it("formats header with ref", () => {
    const report = formatReviewReport(makeSession(), []);
    expect(report).toContain("Review: staged changes");
  });

  it("shows 'No findings' when empty", () => {
    const report = formatReviewReport(makeSession(), []);
    expect(report).toContain("No findings");
    expect(report).toContain("0 findings");
  });

  it("formats findings with severity and category", () => {
    const report = formatReviewReport(makeSession({ findingCount: 1 }), [
      makeFinding(),
    ]);
    expect(report).toContain("[high]");
    expect(report).toContain("bug");
    expect(report).toContain("src/foo.ts:10-15");
    expect(report).toContain("Null check missing");
    expect(report).toContain("Suggestion:");
  });

  it("sorts findings by severity (critical first)", () => {
    const findings = [
      makeFinding({ id: "f1", severity: "low", description: "Low issue" }),
      makeFinding({
        id: "f2",
        severity: "critical",
        description: "Critical issue",
      }),
      makeFinding({
        id: "f3",
        severity: "medium",
        description: "Medium issue",
      }),
    ];
    const report = formatReviewReport(
      makeSession({ findingCount: 3 }),
      findings,
    );
    const critIdx = report.indexOf("Critical issue");
    const medIdx = report.indexOf("Medium issue");
    const lowIdx = report.indexOf("Low issue");
    expect(critIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it("shows token count and duration in summary", () => {
    const report = formatReviewReport(makeSession({ durationMs: 2300 }), []);
    expect(report).toContain("1.2k tokens");
    expect(report).toContain("2.3s");
  });

  it("shows severity breakdown in summary", () => {
    const findings = [
      makeFinding({ id: "f1", severity: "high" }),
      makeFinding({ id: "f2", severity: "medium" }),
      makeFinding({ id: "f3", severity: "medium" }),
    ];
    const report = formatReviewReport(
      makeSession({ findingCount: 3 }),
      findings,
    );
    expect(report).toContain("3 findings (1 high, 2 medium)");
  });

  it("formats location with only startLine", () => {
    const report = formatReviewReport(makeSession({ findingCount: 1 }), [
      makeFinding({ startLine: 20, endLine: undefined }),
    ]);
    expect(report).toContain("src/foo.ts:20");
  });

  it("formats location with no line numbers", () => {
    const report = formatReviewReport(makeSession({ findingCount: 1 }), [
      makeFinding({ startLine: undefined, endLine: undefined }),
    ]);
    expect(report).toContain("src/foo.ts");
    expect(report).not.toContain("src/foo.ts:");
  });
});

describe("formatSessionList", () => {
  it("returns message when no sessions", () => {
    expect(formatSessionList([])).toContain("No review sessions");
  });

  it("formats sessions with date, truncated id, ref, and count", () => {
    const sessions = [
      makeSession({ findingCount: 3 }),
      makeSession({
        id: "def45678-9012-0000-0000-000000000000",
        timestamp: "2026-03-09T10:00:00Z",
        ref: "main...HEAD",
        findingCount: 1,
      }),
    ];
    const output = formatSessionList(sessions);
    expect(output).toContain("[2026-03-10]");
    expect(output).toContain("abc12345");
    expect(output).toContain("staged changes");
    expect(output).toContain("3 findings");
    expect(output).toContain("[2026-03-09]");
    expect(output).toContain("def45678");
    expect(output).toContain("1 finding");
  });
});

describe("filterBySeverity", () => {
  const findings = [
    makeFinding({ id: "f1", severity: "critical" }),
    makeFinding({ id: "f2", severity: "high" }),
    makeFinding({ id: "f3", severity: "medium" }),
    makeFinding({ id: "f4", severity: "low" }),
  ];

  it("filters to critical only", () => {
    const filtered = filterBySeverity(findings, "critical");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].severity).toBe("critical");
  });

  it("filters to high and above", () => {
    const filtered = filterBySeverity(findings, "high");
    expect(filtered).toHaveLength(2);
  });

  it("shows all when threshold is low", () => {
    const filtered = filterBySeverity(findings, "low");
    expect(filtered).toHaveLength(4);
  });
});
