import { describe, it, expect } from "vitest";
import type { ReviewFinding, ReviewSession } from "../agent/review/types.js";
import type { DriftReport } from "../drift/types.js";
import {
  formatFindingComment,
  formatFindingAsSummary,
  formatReviewSummaryBody,
  formatDriftComment,
  findingMarker,
  FINDING_MARKER_RE,
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

  it("embeds finding ID marker as hidden HTML comment", () => {
    const finding = makeFinding({ id: "abc-123-def-456" });
    const result = formatFindingComment(finding);

    expect(result).toContain("<!-- telesis:finding:abc-123-def-456 -->");
    // Marker should be on the first line (before the severity line)
    const lines = result.split("\n");
    expect(lines[0]).toBe("<!-- telesis:finding:abc-123-def-456 -->");
  });

  it("marker is extractable by FINDING_MARKER_RE", () => {
    const finding = makeFinding();
    const result = formatFindingComment(finding);
    const match = FINDING_MARKER_RE.exec(result);

    expect(match).not.toBeNull();
    expect(match![1]).toBe(finding.id);
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

describe("formatFindingAsSummary", () => {
  it("formats finding with line range", () => {
    const result = formatFindingAsSummary(
      makeFinding({ path: "src/foo.ts", startLine: 10, endLine: 20 }),
    );
    expect(result).toContain("`src/foo.ts:10-20`");
    expect(result).toContain("Null reference possible");
  });

  it("formats finding with single line", () => {
    const result = formatFindingAsSummary(
      makeFinding({ startLine: 10, endLine: undefined }),
    );
    expect(result).toContain("`src/index.ts:10`");
  });

  it("formats finding with same start and end line", () => {
    const result = formatFindingAsSummary(
      makeFinding({ startLine: 10, endLine: 10 }),
    );
    expect(result).toContain("`src/index.ts:10`");
  });

  it("formats finding without line info", () => {
    const result = formatFindingAsSummary(
      makeFinding({ startLine: undefined, endLine: undefined }),
    );
    expect(result).toContain("`src/index.ts`");
  });

  it("includes persona when set", () => {
    const result = formatFindingAsSummary(makeFinding({ persona: "security" }));
    expect(result).toContain("_(security)_");
  });

  it("includes suggestion when present", () => {
    const result = formatFindingAsSummary(
      makeFinding({ suggestion: "Add a null check before access" }),
    );
    expect(result).toContain(
      "> **Suggestion:** Add a null check before access",
    );
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

  it("produces 'No New Findings' summary when all findings were filtered", () => {
    const result = formatReviewSummaryBody(makeSession(), [], [], {
      filterStats: {
        dismissalFilteredCount: 3,
        noiseFilteredCount: 1,
        totalFilteredCount: 4,
      },
    });
    expect(result).toContain("## Telesis Review — No New Findings");
    expect(result).toContain("No action required");
    expect(result).toContain("4 finding(s) filtered");
    expect(result).toContain("3 dismissed re-raises");
    expect(result).toContain("1 noise");
    expect(result).not.toContain("**Ref:**");
  });

  it("produces normal summary when there are findings despite filter stats", () => {
    const result = formatReviewSummaryBody(makeSession(), [makeFinding()], [], {
      filterStats: {
        dismissalFilteredCount: 2,
        noiseFilteredCount: 0,
        totalFilteredCount: 2,
      },
    });
    expect(result).toContain("## Telesis Review");
    expect(result).not.toContain("No New Findings");
    expect(result).toContain("1 findings");
  });

  it("produces normal summary when zero findings and no filter stats", () => {
    const result = formatReviewSummaryBody(makeSession(), [], []);
    expect(result).toContain("## Telesis Review");
    expect(result).not.toContain("No New Findings");
    expect(result).toContain("0 findings");
  });

  it("includes estimated cost when provided", () => {
    const result = formatReviewSummaryBody(makeSession(), [makeFinding()], [], {
      estimatedCost: 0.42,
    });
    expect(result).toContain("**Estimated cost:** $0.42");
  });

  it("omits cost line when cost is null", () => {
    const result = formatReviewSummaryBody(makeSession(), [makeFinding()], [], {
      estimatedCost: null,
    });
    expect(result).not.toContain("Estimated cost");
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
