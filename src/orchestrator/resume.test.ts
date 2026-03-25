import { describe, it, expect, vi } from "vitest";
import {
  generateResumeBriefing,
  generateRecommendation,
  formatResumeBriefing,
  type ResumeBriefingDeps,
  type WorkspaceState,
} from "./resume.js";
import type { OrchestratorContext } from "./types.js";

const makeContext = (
  overrides: Partial<OrchestratorContext> = {},
): OrchestratorContext => ({
  state: "executing",
  workItemIds: ["wi-1"],
  updatedAt: "2026-03-25T00:00:00Z",
  planId: "plan-1",
  milestoneId: "0.28.0",
  milestoneName: "Multi-Session Orchestrator",
  ...overrides,
});

const cleanWorkspace: WorkspaceState = {
  hasUncommittedChanges: false,
  hasStagedChanges: false,
  hasUnstagedChanges: false,
  lastCommitSummary: "abc1234 feat: previous work",
};

const stagedWorkspace: WorkspaceState = {
  hasUncommittedChanges: true,
  hasStagedChanges: true,
  hasUnstagedChanges: false,
  lastCommitSummary: "abc1234 feat: previous work",
};

const unstagedWorkspace: WorkspaceState = {
  hasUncommittedChanges: true,
  hasStagedChanges: false,
  hasUnstagedChanges: true,
  lastCommitSummary: "abc1234 feat: previous work",
};

const makeDeps = (
  ctx: OrchestratorContext | null = makeContext(),
  workspace: WorkspaceState = cleanWorkspace,
): ResumeBriefingDeps => ({
  loadContext: () => ctx,
  loadPlan: vi.fn().mockReturnValue({
    id: "plan-1",
    tasks: [
      { id: "t1", title: "Task 1", status: "completed" },
      { id: "t2", title: "Task 2", status: "completed" },
      { id: "t3", title: "Task 3", status: "completed" },
      { id: "t4", title: "Task 4", status: "pending" },
      { id: "t5", title: "Task 5", status: "pending" },
    ],
  }),
  listPendingDecisions: vi.fn().mockReturnValue([]),
  inspectWorkspace: () => workspace,
});

describe("generateRecommendation", () => {
  describe("hook_block exit reason", () => {
    it("recommends review when staged changes exist", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "hook_block",
      });
      const result = generateRecommendation(ctx, stagedWorkspace);
      expect(result).toContain("blocked by preflight");
      expect(result).toContain("review convergence");
    });

    it("recommends staging when only unstaged changes", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "hook_block",
      });
      const result = generateRecommendation(ctx, unstagedWorkspace);
      expect(result).toContain("blocked by preflight");
      expect(result).toContain("stage");
    });

    it("recommends checking stash when no changes", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "hook_block",
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("stash or reflog");
    });
  });

  describe("context_full exit reason", () => {
    it("warns about partial changes when uncommitted", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "context_full",
      });
      const result = generateRecommendation(ctx, stagedWorkspace);
      expect(result).toContain("ran out of context");
      expect(result).toContain("partial");
    });

    it("recommends continuing from checkpoint when clean", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "context_full",
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("last checkpointed task");
    });
  });

  describe("error exit reason", () => {
    it("warns about incomplete changes", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "error",
      });
      const result = generateRecommendation(ctx, stagedWorkspace);
      expect(result).toContain("errored");
      expect(result).toContain("incomplete");
    });

    it("recommends investigating when no changes", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "error",
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("Investigate");
    });
  });

  describe("clean exit reason", () => {
    it("recommends continuing", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "clean",
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("ended normally");
    });
  });

  describe("unknown exit reason", () => {
    it("warns about uncommitted changes", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "unknown",
      });
      const result = generateRecommendation(ctx, stagedWorkspace);
      expect(result).toContain("unknown reason");
      expect(result).toContain("assess");
    });

    it("recommends continuing when clean", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "unknown",
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("Continue from current state");
    });
  });

  describe("undefined exit reason (distinct from unknown)", () => {
    it("warns about uncommitted changes with distinct message", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: undefined,
      });
      const result = generateRecommendation(ctx, stagedWorkspace);
      expect(result).toContain("without recording an exit reason");
    });

    it("recommends continuing when clean", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: undefined,
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("without recording an exit reason");
      expect(result).toContain("Continue from current state");
    });
  });

  describe("edge cases", () => {
    it("handles idle state", () => {
      const ctx = makeContext({ state: "idle" });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("idle");
    });

    it("handles null context", () => {
      const result = generateRecommendation(null, cleanWorkspace);
      expect(result).toContain("idle");
    });

    it("handles no session ID", () => {
      const ctx = makeContext({ sessionId: undefined });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("No previous session");
    });

    it("handles session without endedAt (crash)", () => {
      const ctx = makeContext({
        sessionId: "ses-1",
        sessionEndedAt: undefined,
      });
      const result = generateRecommendation(ctx, cleanWorkspace);
      expect(result).toContain("did not report completion");
    });
  });
});

describe("generateResumeBriefing", () => {
  it("produces complete briefing with task progress", () => {
    const deps = makeDeps(
      makeContext({
        currentTaskIndex: 3,
        sessionId: "ses-1",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "hook_block",
      }),
      stagedWorkspace,
    );

    const briefing = generateResumeBriefing(deps);

    expect(briefing.state).toBe("executing");
    expect(briefing.milestoneId).toBe("0.28.0");
    expect(briefing.completedTasks).toBe(3);
    expect(briefing.totalTasks).toBe(5);
    expect(briefing.currentTaskIndex).toBe(3);
    expect(briefing.currentTaskTitle).toBe("Task 4");
    expect(briefing.hasUncommittedChanges).toBe(true);
    expect(briefing.hasStagedChanges).toBe(true);
    expect(briefing.lastSessionExitReason).toBe("hook_block");
    expect(briefing.recommendation).toContain("review convergence");
  });

  it("handles no orchestrator context", () => {
    const deps = makeDeps(null, cleanWorkspace);
    const briefing = generateResumeBriefing(deps);

    expect(briefing.state).toBe("idle");
    expect(briefing.completedTasks).toBe(0);
    expect(briefing.totalTasks).toBe(0);
  });

  it("includes pending decisions", () => {
    const deps = makeDeps();
    (deps.listPendingDecisions as ReturnType<typeof vi.fn>).mockReturnValue([
      { kind: "escalation", summary: "Task failed" },
    ]);

    const briefing = generateResumeBriefing(deps);

    expect(briefing.pendingDecisions).toHaveLength(1);
    expect(briefing.pendingDecisions[0].kind).toBe("escalation");
  });

  it("is idempotent — same state produces same briefing", () => {
    const ctx = makeContext({
      sessionId: "ses-1",
      sessionEndedAt: "2026-03-25T01:00:00Z",
      sessionExitReason: "clean",
    });
    const deps = makeDeps(ctx, cleanWorkspace);

    const briefing1 = generateResumeBriefing(deps);
    const briefing2 = generateResumeBriefing(deps);

    expect(briefing1).toEqual(briefing2);
  });
});

describe("formatResumeBriefing", () => {
  it("formats complete briefing as readable text", () => {
    const deps = makeDeps(
      makeContext({
        currentTaskIndex: 3,
        sessionId: "abcdefgh-1234-5678-9012-123456789012",
        sessionEndedAt: "2026-03-25T01:00:00Z",
        sessionExitReason: "hook_block",
      }),
      stagedWorkspace,
    );

    const briefing = generateResumeBriefing(deps);
    const formatted = formatResumeBriefing(briefing);

    expect(formatted).toContain("Resume Briefing");
    expect(formatted).toContain("executing");
    expect(formatted).toContain("0.28.0");
    expect(formatted).toContain("3/5 complete");
    expect(formatted).toContain("abcdefgh");
    expect(formatted).toContain("hook_block");
    expect(formatted).toContain("Recommendation");
  });

  it("handles minimal briefing (idle, no session)", () => {
    const deps = makeDeps(null, cleanWorkspace);
    const briefing = generateResumeBriefing(deps);
    const formatted = formatResumeBriefing(briefing);

    expect(formatted).toContain("idle");
    expect(formatted).toContain("Recommendation");
  });
});
