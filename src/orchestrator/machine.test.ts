import { describe, it, expect } from "vitest";
import {
  transition,
  canTransition,
  createContext,
  type TransitionResult,
} from "./machine.js";
import type { OrchestratorContext, OrchestratorState } from "./types.js";

const makeContext = (
  overrides: Partial<OrchestratorContext> = {},
): OrchestratorContext => ({
  state: "idle",
  workItemIds: [],
  updatedAt: "2026-03-15T00:00:00Z",
  ...overrides,
});

describe("createContext", () => {
  it("returns idle state with empty work items", () => {
    const ctx = createContext();
    expect(ctx.state).toBe("idle");
    expect(ctx.workItemIds).toEqual([]);
    expect(ctx.updatedAt).toBeDefined();
  });
});

describe("canTransition", () => {
  it("allows valid forward transitions", () => {
    expect(canTransition("idle", "intake")).toBe(true);
    expect(canTransition("intake", "triage")).toBe(true);
    expect(canTransition("triage", "milestone_setup")).toBe(true);
    expect(canTransition("milestone_setup", "planning")).toBe(true);
    expect(canTransition("planning", "executing")).toBe(true);
    expect(canTransition("executing", "post_task")).toBe(true);
    expect(canTransition("post_task", "reviewing")).toBe(true);
    expect(canTransition("reviewing", "milestone_check")).toBe(true);
    expect(canTransition("milestone_check", "milestone_complete")).toBe(true);
    expect(canTransition("milestone_complete", "idle")).toBe(true);
  });

  it("allows valid backward transitions (rejection/retry)", () => {
    expect(canTransition("intake", "idle")).toBe(true);
    expect(canTransition("triage", "idle")).toBe(true);
    expect(canTransition("milestone_setup", "triage")).toBe(true);
    expect(canTransition("planning", "milestone_setup")).toBe(true);
    expect(canTransition("executing", "planning")).toBe(true);
    expect(canTransition("post_task", "executing")).toBe(true);
    expect(canTransition("reviewing", "executing")).toBe(true);
    expect(canTransition("milestone_check", "reviewing")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("idle", "executing")).toBe(false);
    expect(canTransition("idle", "reviewing")).toBe(false);
    expect(canTransition("intake", "executing")).toBe(false);
    expect(canTransition("triage", "reviewing")).toBe(false);
    expect(canTransition("planning", "milestone_complete")).toBe(false);
    expect(canTransition("executing", "milestone_complete")).toBe(false);
  });

  it("rejects self-transitions", () => {
    expect(canTransition("idle", "idle")).toBe(false);
    expect(canTransition("executing", "executing")).toBe(false);
    expect(canTransition("reviewing", "reviewing")).toBe(false);
  });
});

describe("transition", () => {
  it("advances state on valid transition", () => {
    const ctx = makeContext({ state: "idle" });
    const result = transition(ctx, "intake");
    expect(result.ok).toBe(true);
    expect(result.context.state).toBe("intake");
    expect(result.context.updatedAt).not.toBe(ctx.updatedAt);
  });

  it("preserves context fields across transition", () => {
    const ctx = makeContext({
      state: "planning",
      milestoneId: "0.22.0",
      milestoneName: "Orchestrator",
      workItemIds: ["wi-1", "wi-2"],
      planId: "plan-1",
    });
    const result = transition(ctx, "executing");
    expect(result.ok).toBe(true);
    expect(result.context.milestoneId).toBe("0.22.0");
    expect(result.context.milestoneName).toBe("Orchestrator");
    expect(result.context.workItemIds).toEqual(["wi-1", "wi-2"]);
    expect(result.context.planId).toBe("plan-1");
  });

  it("rejects invalid transition with error", () => {
    const ctx = makeContext({ state: "idle" });
    const result = transition(ctx, "executing");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("idle");
    expect(result.error).toContain("executing");
    expect(result.context.state).toBe("idle");
  });

  it("applies context updates on transition", () => {
    const ctx = makeContext({ state: "idle" });
    const result = transition(ctx, "intake", {
      workItemIds: ["wi-1"],
    });
    expect(result.ok).toBe(true);
    expect(result.context.workItemIds).toEqual(["wi-1"]);
  });

  it("clears error on successful transition", () => {
    const ctx = makeContext({ state: "executing", error: "previous failure" });
    const result = transition(ctx, "post_task");
    expect(result.ok).toBe(true);
    expect(result.context.error).toBeUndefined();
  });

  it("resets review state when entering reviewing", () => {
    const ctx = makeContext({ state: "post_task" });
    const result = transition(ctx, "reviewing");
    expect(result.ok).toBe(true);
    expect(result.context.reviewRound).toBe(1);
    expect(result.context.reviewFindings).toBeUndefined();
  });

  it("resets milestone fields when returning to idle", () => {
    const ctx = makeContext({
      state: "milestone_complete",
      milestoneId: "0.22.0",
      milestoneName: "Orchestrator",
      workItemIds: ["wi-1"],
      planId: "plan-1",
      reviewRound: 3,
    });
    const result = transition(ctx, "idle");
    expect(result.ok).toBe(true);
    expect(result.context.milestoneId).toBeUndefined();
    expect(result.context.milestoneName).toBeUndefined();
    expect(result.context.workItemIds).toEqual([]);
    expect(result.context.planId).toBeUndefined();
    expect(result.context.reviewRound).toBeUndefined();
  });

  // Precondition enforcement tests

  it("requires workItemIds to enter triage", () => {
    const ctx = makeContext({ state: "intake", workItemIds: [] });
    const result = transition(ctx, "triage");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("work item");
  });

  it("allows triage when work items were set in a prior state", () => {
    const ctx = makeContext({ state: "intake", workItemIds: ["wi-1"] });
    const result = transition(ctx, "triage");
    expect(result.ok).toBe(true);
  });

  it("requires milestoneId to enter planning", () => {
    const ctx = makeContext({ state: "milestone_setup" });
    const result = transition(ctx, "planning");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("milestone");
  });

  it("allows planning when milestone was set in milestone_setup", () => {
    const ctx = makeContext({
      state: "milestone_setup",
      milestoneId: "0.22.0",
      milestoneName: "Test",
    });
    const result = transition(ctx, "planning");
    expect(result.ok).toBe(true);
  });

  it("requires planId to enter executing", () => {
    const ctx = makeContext({
      state: "planning",
      milestoneId: "0.22.0",
    });
    const result = transition(ctx, "executing");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("plan");
  });

  it("allows executing when plan was set in planning state", () => {
    const ctx = makeContext({
      state: "planning",
      milestoneId: "0.22.0",
      planId: "plan-1",
    });
    const result = transition(ctx, "executing");
    expect(result.ok).toBe(true);
  });
});

describe("full lifecycle", () => {
  it("can traverse the entire happy path", () => {
    let ctx = createContext();
    const steps: Array<{
      to: OrchestratorState;
      updates?: Partial<OrchestratorContext>;
    }> = [
      { to: "intake", updates: { workItemIds: ["wi-1"] } },
      { to: "triage" },
      {
        to: "milestone_setup",
        updates: { milestoneId: "0.22.0", milestoneName: "Test" },
      },
      { to: "planning", updates: { planId: "plan-1" } },
      { to: "executing" },
      { to: "post_task" },
      { to: "reviewing" },
      { to: "milestone_check" },
      { to: "milestone_complete" },
      { to: "idle" },
    ];

    for (const step of steps) {
      const result = transition(ctx, step.to, step.updates);
      expect(result.ok).toBe(true);
      ctx = result.context;
    }

    expect(ctx.state).toBe("idle");
    expect(ctx.milestoneId).toBeUndefined();
    expect(ctx.workItemIds).toEqual([]);
  });

  it("can retry from reviewing back to executing", () => {
    const ctx = makeContext({
      state: "reviewing",
      milestoneId: "0.22.0",
      planId: "plan-1",
      reviewRound: 2,
    });
    const back = transition(ctx, "executing");
    expect(back.ok).toBe(true);
    expect(back.context.state).toBe("executing");

    const forward = transition(back.context, "post_task");
    expect(forward.ok).toBe(true);
  });
});
