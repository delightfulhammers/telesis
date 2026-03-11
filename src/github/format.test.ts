import { describe, it, expect } from "vitest";
import type { ReviewFinding, ReviewSession } from "../agent/review/types.js";
import type { DriftReport } from "../drift/types.js";
import {
  formatFindingComment,
  formatReviewSummaryBody,
  formatDriftComment,
  DRIFT_COMMENT_MARKER,
} from "./format.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "finding-1",
  sessionId: "session-1",
  severity: "high",
  category: "bug",
  path: "src/index.ts",
  startLine: 10,
  endLine: 15,
  description: "Null reference possible",
  suggestion: "Add a null check before access",
  ...overrides,
});

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
  personas: ["security", "architecture"],
  ...overrides,
});

describe("formatFindingComment", () => {
  it("formats a finding with severity, category, and suggestion", () => {
    const finding = makeFinding();
    const result = formatFindingComment(finding);

    expect(result).toContain("**[high]** bug");
    expect(result).toContain("Null reference possible");
    expect(result).toContain(
      "> **Suggestion:** Add a null check before access",
    );
  });

  it("includes persona attribution when set", () => {
    const finding = makeFinding({ persona: "security" });
    const result = formatFindingComment(finding);

    expect(result).toContain("_— security persona_");
  });

  it("omits persona attribution when not set", () => {
    const finding = makeFinding({ persona: undefined });
    const result = formatFindingComment(finding);

    expect(result).not.toContain("persona_");
  });

  it("omits suggestion block when suggestion is empty", () => {
    const finding = makeFinding({ suggestion: "" });
    const result = formatFindingComment(finding);

    expect(result).not.toContain("Suggestion");
  });
});

describe("formatReviewSummaryBody", () => {
  it("includes header with ref and personas", () => {
    const session = makeSession();
    const result = formatReviewSummaryBody(session, [], []);

    expect(result).toContain("## Telesis Review");
    expect(result).toContain("`origin/main...HEAD`");
    expect(result).toContain("security, architecture");
  });

  it("includes themes when present", () => {
    const session = makeSession({ themes: ["error handling", "null checks"] });
    const result = formatReviewSummaryBody(session, [], []);

    expect(result).toContain("error handling, null checks");
  });

  it("lists summary findings grouped by severity", () => {
    const findings = [
      makeFinding({ severity: "high", description: "High finding" }),
      makeFinding({
        severity: "low",
        id: "finding-2",
        description: "Low finding",
      }),
    ];
    const result = formatReviewSummaryBody(makeSession(), [], findings);

    expect(result).toContain("**high:**");
    expect(result).toContain("High finding");
    expect(result).toContain("**low:**");
    expect(result).toContain("Low finding");
  });

  it("shows correct stats line", () => {
    const inline = [makeFinding()];
    const summary = [makeFinding({ id: "f2" }), makeFinding({ id: "f3" })];
    const result = formatReviewSummaryBody(makeSession(), inline, summary, {
      mergedCount: 2,
    });

    expect(result).toContain("3 findings");
    expect(result).toContain("1 inline");
    expect(result).toContain("2 summary");
    expect(result).toContain("2 merged");
  });
});

describe("formatDriftComment", () => {
  const makeReport = (overrides: Partial<DriftReport> = {}): DriftReport => ({
    checks: [
      {
        check: "test-colocation",
        passed: true,
        message: "All tests colocated",
        severity: "error",
        details: [],
      },
      {
        check: "no-process-exit",
        passed: false,
        message: "process.exit found",
        severity: "error",
        details: ["src/cli/drift.ts:37"],
      },
    ],
    passed: false,
    summary: { total: 2, passed: 1, failed: 1, warnings: 0 },
    ...overrides,
  });

  it("includes the drift marker for idempotent updates", () => {
    const result = formatDriftComment(makeReport());
    expect(result).toContain(DRIFT_COMMENT_MARKER);
  });

  it("renders a markdown table of check results", () => {
    const result = formatDriftComment(makeReport());

    expect(result).toContain("| Check | Status | Details |");
    expect(result).toContain("test-colocation");
    expect(result).toContain("PASS");
    expect(result).toContain("no-process-exit");
    expect(result).toContain("FAIL");
  });

  it("shows details for failed checks", () => {
    const result = formatDriftComment(makeReport());
    expect(result).toContain("`src/cli/drift.ts:37`");
  });

  it("shows warning status for warning-severity findings", () => {
    const report = makeReport({
      checks: [
        {
          check: "stale-refs",
          passed: false,
          message: "Stale references found",
          severity: "warning",
          details: ["docs/PRD.md:12"],
        },
      ],
      summary: { total: 1, passed: 0, failed: 0, warnings: 1 },
    });
    const result = formatDriftComment(report);

    expect(result).toContain("WARN");
    expect(result).toContain("⚠️");
  });

  it("includes summary result line", () => {
    const result = formatDriftComment(makeReport());
    expect(result).toContain("**Result:** 1 passed, 1 failed");
  });
});
