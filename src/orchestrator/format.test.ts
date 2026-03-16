import { describe, it, expect } from "vitest";
import { formatDecisionDetail } from "./format.js";
import type { Decision } from "./types.js";

const makeDecision = (kind: Decision["kind"], detail: string): Decision => ({
  id: "test-id",
  kind,
  createdAt: "2026-03-16T00:00:00Z",
  summary: "Test decision",
  detail,
});

describe("formatDecisionDetail", () => {
  it("formats triage detail with work items and groupings", () => {
    const decision = makeDecision(
      "triage_approval",
      JSON.stringify({
        workItemIds: ["wi-1"],
        workItems: [{ id: "wi-1-full-uuid", title: "Fix login" }],
        suggestedGroupings: [
          {
            name: "Auth Fix",
            goal: "Fix auth bugs",
            workItemIds: ["wi-1-full-uuid"],
          },
        ],
      }),
    );

    const output = formatDecisionDetail(decision);
    expect(output).toContain("Fix login");
    expect(output).toContain("Auth Fix");
    expect(output).toContain("Fix auth bugs");
  });

  it("formats milestone detail with TDD assessment", () => {
    const decision = makeDecision(
      "milestone_approval",
      JSON.stringify({
        milestoneId: "0.25.0",
        needsTdd: true,
        rationale: "New subsystem",
      }),
    );

    const output = formatDecisionDetail(decision);
    expect(output).toContain("0.25.0");
    expect(output).toContain("yes");
    expect(output).toContain("New subsystem");
  });

  it("formats plan detail", () => {
    const decision = makeDecision(
      "plan_approval",
      JSON.stringify({ planId: "plan-1234-5678" }),
    );

    const output = formatDecisionDetail(decision);
    expect(output).toContain("plan-123");
  });

  it("handles malformed JSON gracefully", () => {
    const decision = makeDecision("triage_approval", "not json");
    const output = formatDecisionDetail(decision);
    expect(output).toBe("not json");
  });

  it("returns null for empty detail", () => {
    const decision = makeDecision("triage_approval", "{}");
    const output = formatDecisionDetail(decision);
    expect(output).toBeNull();
  });
});
