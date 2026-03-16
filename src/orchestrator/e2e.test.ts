import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { advance, type RunnerDeps } from "./runner.js";
import { createContext } from "./machine.js";
import type { OrchestratorContext, OrchestratorState } from "./types.js";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("orchestrator-e2e-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test",
      language: "TypeScript",
      languages: ["TypeScript"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  writeFileSync(
    join(rootDir, "docs", "MILESTONES.md"),
    "# Milestones\n\n## v0.99.0 — Test\n\n**Status:** In Progress\n\n### Acceptance Criteria\n\n1. Something\n",
  );
};

describe("orchestrator end-to-end lifecycle", () => {
  it("drives through complete lifecycle: idle → ... → idle", async () => {
    const dir = makeTempDir();
    setupProject(dir);

    const stateLog: OrchestratorState[] = [];

    const deps: RunnerDeps = {
      syncIntake: vi
        .fn()
        .mockResolvedValue({ imported: 1, workItemIds: ["wi-1"] }),
      loadWorkItems: vi
        .fn()
        .mockReturnValue([
          { id: "wi-1", title: "Add feature X", body: "Details about X" },
        ]),
      suggestGrouping: vi.fn().mockResolvedValue({
        milestones: [
          { name: "Feature X", goal: "Add X", workItemIds: ["wi-1"] },
        ],
      }),
      assessTdd: vi.fn().mockResolvedValue({
        needsTdd: false,
        rationale: "Config change only",
      }),
      createMilestoneEntry: vi.fn(),
      createPlan: vi.fn().mockResolvedValue("plan-1"),
      approvePlan: vi.fn(),
      executeTasks: vi.fn().mockResolvedValue({ allComplete: true }),
      runQualityGates: vi.fn().mockResolvedValue({ passed: true }),
      runReviewConvergence: vi.fn().mockResolvedValue({
        converged: true,
        rounds: 2,
        finalFindings: [],
      }),
      runMilestoneCheck: vi.fn().mockResolvedValue({ passed: true }),
      runMilestoneComplete: vi.fn(),
      listPendingDecisions: vi.fn().mockReturnValue([]),
      createDecision: vi.fn().mockReturnValue({ id: "dec-1" }),
      notify: vi.fn(),
      saveContext: vi.fn(),
      emitEvent: vi.fn((payload) => {
        stateLog.push(payload.toState);
      }),
    };

    let ctx = createContext();

    // Drive the state machine forward, simulating human approvals
    // by clearing pendingDecisionKind between waiting states
    const MAX_STEPS = 30;
    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await advance(ctx, deps);
      ctx = result.context;

      if (result.waiting) {
        // Simulate human approval: clear the pending decision marker
        // and set required context fields based on the decision kind
        const kind = ctx.pendingDecisionKind;

        const updates: Partial<OrchestratorContext> = {};
        if (kind === "triage_approval") {
          Object.assign(updates, {
            milestoneId: "0.99.0",
            milestoneName: "Feature X",
            milestoneGoal: "Add X",
          });
        }

        ctx = {
          ...ctx,
          ...updates,
          // Keep pendingDecisionKind so decisionWasApproved detects it
          updatedAt: new Date().toISOString(),
        };
        continue;
      }

      if (result.error) {
        throw new Error(`Orchestrator error at step ${step}: ${result.error}`);
      }

      // If we're back to idle and we've been through more than just the first advance
      if (ctx.state === "idle" && step > 0) {
        break;
      }
    }

    // Verify we completed the full lifecycle
    expect(ctx.state).toBe("idle");

    // Verify state transitions happened in order
    expect(stateLog).toContain("intake");
    expect(stateLog).toContain("triage");
    expect(stateLog).toContain("milestone_setup");
    expect(stateLog).toContain("planning");
    expect(stateLog).toContain("executing");
    expect(stateLog).toContain("post_task");
    expect(stateLog).toContain("reviewing");
    expect(stateLog).toContain("milestone_check");
    expect(stateLog).toContain("milestone_complete");

    // Verify the ordering
    const indexOf = (s: OrchestratorState) => stateLog.indexOf(s);
    expect(indexOf("intake")).toBeLessThan(indexOf("triage"));
    expect(indexOf("triage")).toBeLessThan(indexOf("milestone_setup"));
    expect(indexOf("milestone_setup")).toBeLessThan(indexOf("planning"));
    expect(indexOf("planning")).toBeLessThan(indexOf("executing"));
    expect(indexOf("executing")).toBeLessThan(indexOf("post_task"));
    expect(indexOf("post_task")).toBeLessThan(indexOf("reviewing"));
    expect(indexOf("reviewing")).toBeLessThan(indexOf("milestone_check"));
    expect(indexOf("milestone_check")).toBeLessThan(
      indexOf("milestone_complete"),
    );

    // Verify key business logic was called
    expect(deps.syncIntake).toHaveBeenCalled();
    expect(deps.suggestGrouping).toHaveBeenCalled();
    expect(deps.assessTdd).toHaveBeenCalled();
    expect(deps.createPlan).toHaveBeenCalled();
    expect(deps.executeTasks).toHaveBeenCalledWith("plan-1");
    expect(deps.runQualityGates).toHaveBeenCalled();
    expect(deps.runReviewConvergence).toHaveBeenCalled();
    expect(deps.runMilestoneCheck).toHaveBeenCalled();
    expect(deps.runMilestoneComplete).toHaveBeenCalled();

    // Verify 7 decisions were created (one per human gate)
    const decisionCalls = (deps.createDecision as any).mock.calls;
    const decisionKinds = decisionCalls.map((c: any) => c[0].kind);
    expect(decisionKinds).toContain("triage_approval");
    expect(decisionKinds).toContain("milestone_approval");
    expect(decisionKinds).toContain("plan_approval");
    expect(decisionKinds).toContain("criteria_confirmation");
    expect(decisionKinds).toContain("ship_confirmation");

    // Verify notifications were sent
    expect(deps.notify).toHaveBeenCalled();
  });
});
