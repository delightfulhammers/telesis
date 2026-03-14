import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  labelFindings,
  summarizeConvergence,
  loadPriorFindings,
  listPriorSessions,
  formatConvergenceSummary,
} from "./convergence.js";
import type { LabeledFinding } from "./convergence.js";
import type { ReviewFinding, ReviewSession } from "./types.js";
import { saveReviewSession } from "./store.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("convergence");

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "f1",
  sessionId: "s1",
  severity: "warning",
  category: "bug",
  path: "src/foo.ts",
  startLine: 10,
  endLine: 15,
  description: "Missing error handling in async function",
  suggestion: "Add try-catch block",
  confidence: 80,
  persona: "reviewer",
  ...overrides,
});

const makeSession = (
  overrides: Partial<ReviewSession> = {},
): ReviewSession => ({
  id: "00000000-0000-0000-0000-000000000001",
  timestamp: "2026-03-13T10:00:00.000Z",
  ref: "HEAD~1",
  files: [{ path: "src/foo.ts", status: "modified" }],
  findingCount: 1,
  model: "claude-sonnet-4-6",
  durationMs: 5000,
  tokenUsage: { inputTokens: 1000, outputTokens: 500 },
  mode: "personas",
  ...overrides,
});

describe("labelFindings", () => {
  it("labels all findings as new when no priors exist", () => {
    const current = [makeFinding({ id: "a" }), makeFinding({ id: "b" })];
    const labeled = labelFindings(current, []);

    expect(labeled).toHaveLength(2);
    expect(labeled.every((l) => l.label === "new")).toBe(true);
  });

  it("labels matching findings as persistent", () => {
    const current = [makeFinding({ id: "new-id", startLine: 10 })];
    const priors = [makeFinding({ id: "old-id", startLine: 12 })];

    const labeled = labelFindings(current, priors);
    const persistent = labeled.filter((l) => l.label === "persistent");

    expect(persistent).toHaveLength(1);
    expect(persistent[0]!.priorMatch).toBeDefined();
    expect(persistent[0]!.priorMatch!.finding.id).toBe("old-id");
  });

  it("labels unmatched priors as resolved", () => {
    const current: ReviewFinding[] = [];
    const priors = [makeFinding({ id: "old-id" })];

    const labeled = labelFindings(current, priors);
    const resolved = labeled.filter((l) => l.label === "resolved");

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.finding.id).toBe("old-id");
  });

  it("handles mixed labels correctly", () => {
    const current = [
      makeFinding({ id: "persistent-new", startLine: 10 }),
      makeFinding({
        id: "brand-new",
        path: "src/bar.ts",
        description: "completely new issue",
      }),
    ];
    const priors = [
      makeFinding({ id: "persistent-old", startLine: 11 }),
      makeFinding({
        id: "resolved-old",
        path: "src/baz.ts",
        description: "was fixed",
      }),
    ];

    const labeled = labelFindings(current, priors);

    const byLabel = (label: string): LabeledFinding[] =>
      labeled.filter((l) => l.label === label);

    expect(byLabel("persistent")).toHaveLength(1);
    expect(byLabel("new")).toHaveLength(1);
    expect(byLabel("resolved")).toHaveLength(1);
  });
});

describe("summarizeConvergence", () => {
  it("reports converged when no current findings and all resolved", () => {
    const labeled: LabeledFinding[] = [
      { finding: makeFinding(), label: "resolved" },
    ];

    const summary = summarizeConvergence(labeled, [makeSession()]);

    expect(summary.converged).toBe(true);
    expect(summary.round).toBe(2);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.totalCount).toBe(0);
  });

  it("reports not converged when new findings exist", () => {
    const labeled: LabeledFinding[] = [
      { finding: makeFinding(), label: "new" },
    ];

    const summary = summarizeConvergence(labeled, []);

    expect(summary.converged).toBe(false);
    expect(summary.round).toBe(1);
    expect(summary.newCount).toBe(1);
  });

  it("reports not converged when persistent findings exist", () => {
    const labeled: LabeledFinding[] = [
      {
        finding: makeFinding(),
        label: "persistent",
        priorMatch: {
          finding: makeFinding(),
          strategy: "positional",
          score: 0.8,
        },
      },
    ];

    const summary = summarizeConvergence(labeled, [makeSession()]);

    expect(summary.converged).toBe(false);
    expect(summary.persistentCount).toBe(1);
  });

  it("counts rounds correctly from prior sessions", () => {
    const priors = [
      makeSession({ id: "00000000-0000-0000-0000-000000000001" }),
      makeSession({ id: "00000000-0000-0000-0000-000000000002" }),
    ];

    const summary = summarizeConvergence([], priors);

    expect(summary.round).toBe(3);
    expect(summary.converged).toBe(true);
  });

  it("detects plateau when round >= 3 and recurring ratio >= 0.8", () => {
    const labeled: LabeledFinding[] = [
      ...Array.from({ length: 4 }, (_, i) => ({
        finding: makeFinding({ id: `p${i}` }),
        label: "persistent" as const,
        priorMatch: {
          finding: makeFinding({ id: `old-p${i}` }),
          strategy: "positional" as const,
          score: 0.8,
        },
      })),
      { finding: makeFinding({ id: "n1" }), label: "new" as const },
    ];
    const priors = [
      makeSession({ id: "00000000-0000-0000-0000-000000000001" }),
      makeSession({ id: "00000000-0000-0000-0000-000000000002" }),
    ];

    const summary = summarizeConvergence(labeled, priors);

    expect(summary.round).toBe(3);
    expect(summary.recurringRatio).toBe(0.8);
    expect(summary.plateauDetected).toBe(true);
  });

  it("does not detect plateau on round 2 even with 100% persistent", () => {
    const labeled: LabeledFinding[] = [
      {
        finding: makeFinding(),
        label: "persistent",
        priorMatch: {
          finding: makeFinding(),
          strategy: "positional",
          score: 0.8,
        },
      },
    ];
    const priors = [makeSession()];

    const summary = summarizeConvergence(labeled, priors);

    expect(summary.round).toBe(2);
    expect(summary.recurringRatio).toBe(1);
    expect(summary.plateauDetected).toBe(false);
  });

  it("does not detect plateau when ratio < 0.8", () => {
    const labeled: LabeledFinding[] = [
      {
        finding: makeFinding({ id: "p1" }),
        label: "persistent",
        priorMatch: {
          finding: makeFinding({ id: "old" }),
          strategy: "positional",
          score: 0.8,
        },
      },
      { finding: makeFinding({ id: "n1" }), label: "new" },
      { finding: makeFinding({ id: "n2" }), label: "new" },
    ];
    const priors = [
      makeSession({ id: "00000000-0000-0000-0000-000000000001" }),
      makeSession({ id: "00000000-0000-0000-0000-000000000002" }),
    ];

    const summary = summarizeConvergence(labeled, priors);

    expect(summary.round).toBe(3);
    expect(summary.recurringRatio).toBeCloseTo(0.333, 2);
    expect(summary.plateauDetected).toBe(false);
  });
});

describe("formatConvergenceSummary", () => {
  it("formats converged summary", () => {
    const summary = {
      round: 3,
      newCount: 0,
      persistentCount: 0,
      resolvedCount: 5,
      totalCount: 0,
      converged: true,
      recurringRatio: 0,
      plateauDetected: false,
    };

    const text = formatConvergenceSummary(summary);
    expect(text).toContain("Round 3");
    expect(text).toContain("Converged");
  });

  it("formats non-converged summary with all label types", () => {
    const summary = {
      round: 2,
      newCount: 2,
      persistentCount: 1,
      resolvedCount: 3,
      totalCount: 3,
      converged: false,
      recurringRatio: 1 / 3,
      plateauDetected: false,
    };

    const text = formatConvergenceSummary(summary);
    expect(text).toContain("Round 2");
    expect(text).toContain("2 new");
    expect(text).toContain("1 persistent");
    expect(text).toContain("3 resolved");
    expect(text).not.toContain("plateaued");
  });

  it("includes plateau message when plateau detected", () => {
    const summary = {
      round: 3,
      newCount: 1,
      persistentCount: 4,
      resolvedCount: 0,
      totalCount: 5,
      converged: false,
      recurringRatio: 0.8,
      plateauDetected: true,
    };

    const text = formatConvergenceSummary(summary);
    expect(text).toContain("plateaued");
    expect(text).toContain("Consider dismissing or stopping");
  });

  it("omits plateau message when not detected", () => {
    const summary = {
      round: 3,
      newCount: 3,
      persistentCount: 1,
      resolvedCount: 0,
      totalCount: 4,
      converged: false,
      recurringRatio: 0.25,
      plateauDetected: false,
    };

    const text = formatConvergenceSummary(summary);
    expect(text).not.toContain("plateaued");
  });
});

describe("loadPriorFindings", () => {
  it("returns empty array when no prior sessions exist", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    const result = loadPriorFindings(dir, "HEAD~1", "current-session");
    expect(result).toEqual([]);
  });

  it("loads findings from most recent prior session with same ref", () => {
    const dir = makeTempDir();
    const session = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "HEAD~1",
    });
    const finding = makeFinding({
      id: "prior-finding",
      sessionId: session.id,
    });

    saveReviewSession(dir, session, [finding]);

    const result = loadPriorFindings(dir, "HEAD~1", "different-session");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("prior-finding");
  });

  it("excludes current session from priors", () => {
    const dir = makeTempDir();
    const sessionId = "00000000-0000-0000-0000-000000000001";
    const session = makeSession({ id: sessionId, ref: "HEAD~1" });
    saveReviewSession(dir, session, [makeFinding()]);

    const result = loadPriorFindings(dir, "HEAD~1", sessionId);
    expect(result).toEqual([]);
  });

  it("ignores sessions with disjoint file sets for the same ref", () => {
    const dir = makeTempDir();
    const session = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "staged changes",
      files: [{ path: "src/old.ts", status: "modified" }],
    });
    saveReviewSession(dir, session, [makeFinding()]);

    const currentFiles = [{ path: "src/new.ts", status: "added" as const }];
    const result = loadPriorFindings(
      dir,
      "staged changes",
      "current-session",
      undefined,
      currentFiles,
    );
    expect(result).toEqual([]);
  });

  it("ignores sessions with different ref", () => {
    const dir = makeTempDir();
    const session = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "HEAD~2",
    });
    saveReviewSession(dir, session, [makeFinding()]);

    const result = loadPriorFindings(dir, "HEAD~1", "current-session");
    expect(result).toEqual([]);
  });
});

describe("listPriorSessions", () => {
  it("returns empty array when no sessions exist", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    const result = listPriorSessions(dir, "HEAD~1", "current");
    expect(result).toEqual([]);
  });

  it("lists sessions with same ref excluding current", () => {
    const dir = makeTempDir();
    const s1 = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "HEAD~1",
    });
    const s2 = makeSession({
      id: "00000000-0000-0000-0000-000000000002",
      ref: "HEAD~1",
    });
    const s3 = makeSession({
      id: "00000000-0000-0000-0000-000000000003",
      ref: "HEAD~2",
    });

    saveReviewSession(dir, s1, []);
    saveReviewSession(dir, s2, []);
    saveReviewSession(dir, s3, []);

    const result = listPriorSessions(dir, "HEAD~1", s2.id);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(s1.id);
  });

  it("excludes sessions with disjoint file sets for the same ref", () => {
    const dir = makeTempDir();
    const s1 = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "staged changes",
      files: [{ path: "src/foo.ts", status: "modified" }],
    });
    const s2 = makeSession({
      id: "00000000-0000-0000-0000-000000000002",
      ref: "staged changes",
      files: [{ path: "src/bar.ts", status: "modified" }],
    });

    saveReviewSession(dir, s1, []);
    saveReviewSession(dir, s2, []);

    const currentFiles = [{ path: "src/baz.ts", status: "added" as const }];
    const result = listPriorSessions(
      dir,
      "staged changes",
      "current-session",
      undefined,
      currentFiles,
    );
    expect(result).toHaveLength(0);
  });

  it("includes sessions with overlapping file sets for the same ref", () => {
    const dir = makeTempDir();
    const s1 = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "staged changes",
      files: [
        { path: "src/foo.ts", status: "modified" },
        { path: "src/bar.ts", status: "modified" },
      ],
    });

    saveReviewSession(dir, s1, []);

    const currentFiles = [
      { path: "src/foo.ts", status: "modified" as const },
      { path: "src/bar.ts", status: "modified" as const },
      { path: "src/baz.ts", status: "added" as const },
    ];
    const result = listPriorSessions(
      dir,
      "staged changes",
      "current-session",
      undefined,
      currentFiles,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(s1.id);
  });

  it("skips file overlap check when currentFiles is not provided", () => {
    const dir = makeTempDir();
    const s1 = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      ref: "HEAD~1",
      files: [{ path: "src/foo.ts", status: "modified" }],
    });

    saveReviewSession(dir, s1, []);

    // No currentFiles → pure ref matching (backward compat)
    const result = listPriorSessions(dir, "HEAD~1", "current-session");
    expect(result).toHaveLength(1);
  });
});
