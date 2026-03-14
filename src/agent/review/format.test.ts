import { describe, it, expect } from "vitest";
import {
  formatReviewReport,
  formatPersonaReport,
  formatSessionList,
  filterBySeverity,
  formatFinding,
} from "./format.js";
import type { ReviewSession, ReviewFinding } from "./types.js";
import type { Dismissal } from "./dismissal/types.js";
import type { FindingLabel } from "./convergence.js";

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
  mode: "single",
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

describe("formatPersonaReport", () => {
  it("displays persona headers with findings grouped underneath", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security", "correctness"],
    });
    const findings = [
      makeFinding({
        id: "f1",
        severity: "critical",
        persona: "security",
        description: "SQL injection",
      }),
      makeFinding({
        id: "f2",
        severity: "medium",
        persona: "correctness",
        description: "Missing null check",
      }),
    ];
    const report = formatPersonaReport(session, findings);
    expect(report).toContain("Personas: security, correctness");
    expect(report).toContain("Security");
    expect(report).toContain("Correctness");
    expect(report).toContain("SQL injection");
    expect(report).toContain("Missing null check");
    // Security findings should appear before correctness
    expect(report.indexOf("Security")).toBeLessThan(
      report.indexOf("Correctness"),
    );
  });

  it("shows merge count when duplicates were merged", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security", "correctness"],
    });
    const findings = [makeFinding({ id: "f1", persona: "security" })];
    const report = formatPersonaReport(session, findings, { mergedCount: 2 });
    expect(report).toContain("2 duplicates merged across personas");
  });

  it("omits merge line when mergedCount is 0", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
    });
    const findings = [makeFinding({ id: "f1", persona: "security" })];
    const report = formatPersonaReport(session, findings);
    expect(report).not.toContain("duplicates merged");
  });

  it("shows themes when present on session", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
      themes: ["SQL injection", "input validation"],
    });
    const findings = [makeFinding({ id: "f1", persona: "security" })];
    const report = formatPersonaReport(session, findings);
    expect(report).toContain("Themes: SQL injection, input validation");
  });

  it("sorts findings within each persona by severity", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
    });
    const findings = [
      makeFinding({
        id: "f1",
        severity: "low",
        persona: "security",
        description: "Low issue",
      }),
      makeFinding({
        id: "f2",
        severity: "critical",
        persona: "security",
        description: "Critical issue",
      }),
    ];
    const report = formatPersonaReport(session, findings);
    expect(report.indexOf("Critical issue")).toBeLessThan(
      report.indexOf("Low issue"),
    );
  });

  it("handles persona with no findings gracefully", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security", "correctness"],
    });
    const findings = [makeFinding({ id: "f1", persona: "security" })];
    const report = formatPersonaReport(session, findings);
    expect(report).toContain("Security");
    expect(report).toContain("Correctness");
    expect(report).toContain("No findings");
  });

  it("shows 0 findings message when all findings empty", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
    });
    const report = formatPersonaReport(session, []);
    expect(report).toContain("0 findings");
  });

  it("applies convergence labels to findings", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
    });
    const findings = [
      makeFinding({ id: "f1", persona: "security", description: "Issue A" }),
      makeFinding({ id: "f2", persona: "security", description: "Issue B" }),
    ];
    const labels = new Map<string, FindingLabel>([
      ["f1", "persistent"],
      ["f2", "new"],
    ]);
    const report = formatPersonaReport(session, findings, {
      convergenceLabels: labels,
    });
    expect(report).toContain("[recurring]");
    expect(report).toContain("[new]");
  });

  it("displays activeThemes instead of session themes when provided", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
      themes: ["old theme A", "old theme B"],
    });
    const report = formatPersonaReport(session, [], {
      activeThemes: ["old theme A"],
    });
    expect(report).toContain("Themes: old theme A");
    expect(report).not.toContain("old theme B");
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

describe("formatFinding", () => {
  const finding: ReviewFinding = {
    id: "f-1",
    sessionId: "s-1",
    severity: "high",
    category: "security",
    path: "src/auth.ts",
    startLine: 42,
    description: "SQL injection via unsanitized input",
    suggestion: "Use parameterized queries",
  };

  it("formats without dismissal annotation when no dismissal", () => {
    const result = formatFinding(finding);
    expect(result).toContain("[high] security");
    expect(result).toContain("src/auth.ts:42");
    expect(result).not.toContain("DISMISSED");
  });

  it("includes [DISMISSED: reason] when dismissal provided", () => {
    const dismissal: Dismissal = {
      id: "d-1",
      findingId: "f-1",
      sessionId: "s-1",
      reason: "false-positive",
      timestamp: "2026-03-10T00:00:00Z",
      source: "cli",
      path: "src/auth.ts",
      severity: "high",
      category: "security",
      description: "SQL injection via unsanitized input",
      suggestion: "Use parameterized queries",
    };
    const result = formatFinding(finding, dismissal);
    expect(result).toContain("[DISMISSED: false-positive]");
    expect(result).toContain("[high] security");
  });

  it("includes [new] when convergence label is new", () => {
    const result = formatFinding(finding, undefined, "new");
    expect(result).toContain("[new]");
    expect(result).toContain("src/auth.ts:42 [new]");
  });

  it("includes [recurring] when convergence label is persistent", () => {
    const result = formatFinding(finding, undefined, "persistent");
    expect(result).toContain("[recurring]");
    expect(result).toContain("src/auth.ts:42 [recurring]");
  });

  it("omits convergence tag when no label provided", () => {
    const result = formatFinding(finding);
    expect(result).not.toContain("[new]");
    expect(result).not.toContain("[recurring]");
  });
});

describe("cost in summary line", () => {
  it("includes cost when provided to formatReviewReport", () => {
    const session = makeSession({ mode: "single" });
    const result = formatReviewReport(session, [], { cost: 0.05 });
    expect(result).toContain("$0.05");
  });

  it("omits cost when null", () => {
    const session = makeSession({ mode: "single" });
    const result = formatReviewReport(session, [], { cost: null });
    expect(result).not.toContain("$");
  });

  it("includes cost when provided to formatPersonaReport", () => {
    const session = makeSession({
      mode: "personas",
      personas: ["security"],
    });
    const result = formatPersonaReport(session, [], { cost: 1.23 });
    expect(result).toContain("$1.23");
  });
});
