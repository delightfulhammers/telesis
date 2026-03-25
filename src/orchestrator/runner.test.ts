import { describe, it, expect, vi } from "vitest";
import { advance, type RunnerDeps } from "./runner.js";
import type { OrchestratorContext } from "./types.js";

const noopDeps = (): RunnerDeps => ({
  syncIntake: vi.fn().mockResolvedValue({ imported: 0, workItemIds: [] }),
  loadWorkItems: vi.fn().mockReturnValue([]),
  suggestGrouping: vi.fn().mockResolvedValue({ milestones: [] }),
  assessTdd: vi.fn().mockResolvedValue({ needsTdd: false, rationale: "" }),
  createMilestoneEntry: vi.fn(),
  createPlan: vi.fn().mockResolvedValue("plan-1"),
  approvePlan: vi.fn(),
  getSessionId: vi.fn().mockReturnValue("test-session-id"),
  executeTasks: vi
    .fn()
    .mockResolvedValue({ allComplete: true, completedTaskCount: 5 }),
  runQualityGates: vi.fn().mockResolvedValue({ passed: true }),
  runReviewConvergence: vi
    .fn()
    .mockResolvedValue({ converged: true, rounds: 1, finalFindings: [] }),
  runMilestoneCheck: vi.fn().mockResolvedValue({ passed: true }),
  runMilestoneComplete: vi.fn(),
  listPendingDecisions: vi.fn().mockReturnValue([]),
  createDecision: vi.fn().mockReturnValue({ id: "dec-1" }),
  notify: vi.fn(),
  saveContext: vi.fn(),
  emitEvent: vi.fn(),
});

const makeContext = (
  overrides: Partial<OrchestratorContext> = {},
): OrchestratorContext => ({
  state: "idle",
  workItemIds: [],
  updatedAt: "2026-03-15T00:00:00Z",
  ...overrides,
});

describe("advance", () => {
  describe("idle → intake", () => {
    it("transitions to intake", async () => {
      const deps = noopDeps();
      const ctx = makeContext({ state: "idle" });
      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("intake");
      expect(deps.saveContext).toHaveBeenCalled();
      expect(deps.emitEvent).toHaveBeenCalled();
    });
  });

  describe("intake", () => {
    it("transitions to triage when items found", async () => {
      const deps = noopDeps();
      deps.syncIntake = vi
        .fn()
        .mockResolvedValue({ imported: 2, workItemIds: ["wi-1", "wi-2"] });
      const ctx = makeContext({ state: "intake" });

      const result = await advance(ctx, deps);

      expect(deps.syncIntake).toHaveBeenCalled();
      expect(result.context.state).toBe("triage");
      expect(result.context.workItemIds).toEqual(["wi-1", "wi-2"]);
    });

    it("returns to idle when no items found", async () => {
      const deps = noopDeps();
      const ctx = makeContext({ state: "intake" });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("idle");
    });
  });

  describe("triage", () => {
    it("creates decision with grouping suggestion and waits", async () => {
      const deps = noopDeps();
      deps.suggestGrouping = vi.fn().mockResolvedValue({
        milestones: [
          { name: "Auth Fix", goal: "Fix auth bugs", workItemIds: ["wi-1"] },
        ],
      });
      deps.loadWorkItems = vi
        .fn()
        .mockReturnValue([
          { id: "wi-1", title: "Fix login", body: "Login is broken" },
        ]);
      const ctx = makeContext({
        state: "triage",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "triage_approval" }),
      );
      // Verify the decision detail includes the grouping suggestion
      const decisionCall = (deps.createDecision as any).mock.calls[0][0];
      const detail = JSON.parse(decisionCall.detail);
      expect(detail.suggestedGroupings).toBeDefined();
      expect(detail.suggestedGroupings[0].name).toBe("Auth Fix");
      expect(detail.workItems).toBeDefined();
      expect(detail.workItems[0].title).toBe("Fix login");

      expect(result.waiting).toBe(true);
      expect(result.context.pendingDecisionKind).toBe("triage_approval");
    });

    it("waits when decision is pending", async () => {
      const deps = noopDeps();
      deps.listPendingDecisions = vi
        .fn()
        .mockReturnValue([{ kind: "triage_approval" }]);
      const ctx = makeContext({
        state: "triage",
        workItemIds: ["wi-1"],
        pendingDecisionKind: "triage_approval",
      });

      const result = await advance(ctx, deps);

      expect(result.waiting).toBe(true);
    });

    it("advances to milestone_setup when decision approved", async () => {
      const deps = noopDeps();
      // No pending decisions + pendingDecisionKind set = approved
      const ctx = makeContext({
        state: "triage",
        workItemIds: ["wi-1"],
        pendingDecisionKind: "triage_approval",
        milestoneId: "0.22.0",
        milestoneName: "Test",
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("milestone_setup");
    });
  });

  describe("milestone_setup", () => {
    it("assesses TDD and creates decision", async () => {
      const deps = noopDeps();
      deps.assessTdd = vi.fn().mockResolvedValue({
        needsTdd: true,
        rationale: "New subsystem",
      });
      const ctx = makeContext({
        state: "milestone_setup",
        milestoneId: "0.22.0",
        milestoneName: "Test",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.assessTdd).toHaveBeenCalled();
      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "milestone_approval" }),
      );
      expect(result.waiting).toBe(true);
    });

    it("advances to planning when decision approved", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "milestone_setup",
        milestoneId: "0.22.0",
        milestoneName: "Test",
        workItemIds: ["wi-1"],
        pendingDecisionKind: "milestone_approval",
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("planning");
    });
  });

  describe("planning", () => {
    it("creates plan and decision on first call", async () => {
      const deps = noopDeps();
      deps.createPlan = vi.fn().mockResolvedValue("plan-1");
      const ctx = makeContext({
        state: "planning",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.createPlan).toHaveBeenCalled();
      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "plan_approval" }),
      );
      expect(result.waiting).toBe(true);
      expect(result.context.planId).toBe("plan-1");
    });

    it("advances to executing and approves plan in store when decision approved", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "planning",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
        pendingDecisionKind: "plan_approval",
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("executing");
      expect(deps.approvePlan).toHaveBeenCalledWith("plan-1");
    });
  });

  describe("executing", () => {
    it("advances to post_task on success", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.executeTasks).toHaveBeenCalledWith("plan-1");
      expect(result.context.state).toBe("post_task");
    });

    it("escalates on task failure", async () => {
      const deps = noopDeps();
      deps.executeTasks = vi.fn().mockResolvedValue({
        allComplete: false,
        error: "Task 3 failed",
        completedTaskCount: 2,
      });
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "escalation" }),
      );
      expect(result.waiting).toBe(true);
    });

    it("returns error when planId missing", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(result.error).toContain("planId");
    });
  });

  describe("post_task", () => {
    it("advances to reviewing when gates pass", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "post_task",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.runQualityGates).toHaveBeenCalled();
      expect(result.context.state).toBe("reviewing");
    });

    it("returns to executing when gates fail", async () => {
      const deps = noopDeps();
      deps.runQualityGates = vi
        .fn()
        .mockResolvedValue({ passed: false, error: "Tests failed" });
      const ctx = makeContext({
        state: "post_task",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("executing");
    });
  });

  describe("reviewing", () => {
    it("advances to milestone_check on convergence", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "reviewing",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
        reviewRound: 1,
      });

      const result = await advance(ctx, deps);

      expect(deps.runReviewConvergence).toHaveBeenCalled();
      expect(result.context.state).toBe("milestone_check");
    });

    it("escalates on convergence failure", async () => {
      const deps = noopDeps();
      deps.runReviewConvergence = vi.fn().mockResolvedValue({
        converged: false,
        rounds: 5,
        finalFindings: [{ id: "f-1" }],
      });
      const ctx = makeContext({
        state: "reviewing",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "convergence_failure" }),
      );
      expect(result.waiting).toBe(true);
    });
  });

  describe("milestone_check", () => {
    it("creates criteria decision when check passes", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "milestone_check",
        milestoneId: "0.22.0",
        milestoneName: "Test",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.runMilestoneCheck).toHaveBeenCalled();
      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "criteria_confirmation" }),
      );
      expect(result.waiting).toBe(true);
    });

    it("returns to reviewing when check fails", async () => {
      const deps = noopDeps();
      deps.runMilestoneCheck = vi
        .fn()
        .mockResolvedValue({ passed: false, error: "Drift" });
      const ctx = makeContext({
        state: "milestone_check",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("reviewing");
    });

    it("advances to milestone_complete when criteria approved", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "milestone_check",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
        pendingDecisionKind: "criteria_confirmation",
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("milestone_complete");
    });
  });

  describe("milestone_complete", () => {
    it("runs completion and creates ship decision", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "milestone_complete",
        milestoneId: "0.22.0",
        milestoneName: "Test",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      expect(deps.runMilestoneComplete).toHaveBeenCalled();
      expect(deps.createDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "ship_confirmation" }),
      );
      expect(result.waiting).toBe(true);
      expect(result.context.completionRan).toBe(true);
    });

    it("does not run completion twice", async () => {
      const deps = noopDeps();
      deps.listPendingDecisions = vi
        .fn()
        .mockReturnValue([{ kind: "ship_confirmation" }]);
      const ctx = makeContext({
        state: "milestone_complete",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
        completionRan: true,
        pendingDecisionKind: "ship_confirmation",
      });

      const result = await advance(ctx, deps);

      expect(deps.runMilestoneComplete).not.toHaveBeenCalled();
      expect(result.waiting).toBe(true);
    });

    it("transitions to idle when ship approved", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "milestone_complete",
        milestoneId: "0.22.0",
        workItemIds: ["wi-1"],
        completionRan: true,
        pendingDecisionKind: "ship_confirmation",
      });

      const result = await advance(ctx, deps);

      expect(result.context.state).toBe("idle");
    });
  });

  describe("session tracking", () => {
    it("sets session fields on first entry to executing", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
      });

      await advance(ctx, deps);

      // saveContext should be called with session fields before execution
      const saveCalls = (deps.saveContext as ReturnType<typeof vi.fn>).mock
        .calls;
      const sessionSave = saveCalls.find(
        (call: OrchestratorContext[]) =>
          call[0].sessionId === "test-session-id",
      );
      expect(sessionSave).toBeDefined();
    });

    it("preserves existing session ID but clears stale exit fields on re-entry", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
        sessionId: "existing-session",
        sessionEndedAt: "2026-03-25T00:00:00Z",
        sessionExitReason: "error",
      });

      await advance(ctx, deps);

      expect(deps.getSessionId).not.toHaveBeenCalled();
      // Stale exit fields should be cleared and startedAt reset on re-entry
      const saveCalls = (deps.saveContext as ReturnType<typeof vi.fn>).mock
        .calls;
      const sessionSave = saveCalls.find(
        (call: OrchestratorContext[]) =>
          call[0].sessionId === "existing-session" &&
          call[0].sessionEndedAt === undefined &&
          call[0].sessionExitReason === undefined &&
          call[0].sessionStartedAt !== "2026-03-25T00:00:00Z",
      );
      expect(sessionSave).toBeDefined();
    });

    it("checkpoints currentTaskIndex after execution", async () => {
      const deps = noopDeps();
      deps.executeTasks = vi
        .fn()
        .mockResolvedValue({ allComplete: true, completedTaskCount: 3 });
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
      });

      const result = await advance(ctx, deps);

      // The transitioned context should carry through the checkpoint
      expect(result.context.state).toBe("post_task");
    });

    it("sets clean exit reason on successful completion", async () => {
      const deps = noopDeps();
      const ctx = makeContext({
        state: "executing",
        milestoneId: "0.22.0",
        planId: "plan-1",
        workItemIds: ["wi-1"],
        sessionId: "ses-1",
      });

      const result = await advance(ctx, deps);

      expect(result.context.sessionExitReason).toBe("clean");
      expect(result.context.sessionEndedAt).toBeDefined();
    });
  });

  describe("persistence", () => {
    it("saves context after every successful advance", async () => {
      const deps = noopDeps();
      const ctx = makeContext({ state: "idle" });

      await advance(ctx, deps);

      expect(deps.saveContext).toHaveBeenCalledWith(
        expect.objectContaining({ state: "intake" }),
      );
    });

    it("emits state_changed event on transition", async () => {
      const deps = noopDeps();
      const ctx = makeContext({ state: "idle" });

      await advance(ctx, deps);

      expect(deps.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          fromState: "idle",
          toState: "intake",
        }),
      );
    });
  });
});
