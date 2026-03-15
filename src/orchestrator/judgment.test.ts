import { describe, it, expect, vi } from "vitest";
import { suggestTriageGrouping, assessTddNecessity } from "./judgment.js";

const mockClient = (response: string) => ({
  complete: vi.fn().mockResolvedValue({
    content: response,
    model: "claude-haiku-4-5-20251001",
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 500,
  }),
});

describe("suggestTriageGrouping", () => {
  it("returns grouping suggestion from LLM", async () => {
    const client = mockClient(
      JSON.stringify({
        milestones: [
          {
            name: "Auth Improvements",
            goal: "Strengthen authentication",
            workItemIds: ["wi-1", "wi-2"],
          },
        ],
      }),
    );

    const result = await suggestTriageGrouping(client as any, [
      { id: "wi-1", title: "Add MFA support", body: "Multi-factor auth" },
      { id: "wi-2", title: "Fix password reset", body: "Reset flow broken" },
    ]);

    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].workItemIds).toEqual(["wi-1", "wi-2"]);
    expect(result.tokenUsage).toBeDefined();
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it("includes work item context in the prompt", async () => {
    const client = mockClient(JSON.stringify({ milestones: [] }));

    await suggestTriageGrouping(client as any, [
      { id: "wi-1", title: "Add caching", body: "Redis caching layer" },
    ]);

    const call = client.complete.mock.calls[0][0];
    expect(call.messages[0].content).toContain("Add caching");
    expect(call.messages[0].content).toContain("Redis caching layer");
  });
});

describe("assessTddNecessity", () => {
  it("returns true when LLM says TDD is needed", async () => {
    const client = mockClient(
      JSON.stringify({
        needsTdd: true,
        rationale: "New orchestrator subsystem with its own interface boundary",
      }),
    );

    const result = await assessTddNecessity(client as any, {
      milestoneName: "Orchestrator Walking Skeleton",
      milestoneGoal: "Turn Telesis into a feedback and control system",
      workItemTitles: ["Build orchestrator state machine"],
    });

    expect(result.needsTdd).toBe(true);
    expect(result.rationale).toContain("interface boundary");
    expect(result.tokenUsage).toBeDefined();
  });

  it("returns false when LLM says TDD is not needed", async () => {
    const client = mockClient(
      JSON.stringify({
        needsTdd: false,
        rationale: "Configuration change only, no new subsystem",
      }),
    );

    const result = await assessTddNecessity(client as any, {
      milestoneName: "Config cleanup",
      milestoneGoal: "Fix config validation bugs",
      workItemTitles: ["Fix YAML parsing edge case"],
    });

    expect(result.needsTdd).toBe(false);
  });

  it("defaults to true on parse failure (safe fallback)", async () => {
    const client = mockClient("I think you might need a TDD for this.");

    const result = await assessTddNecessity(client as any, {
      milestoneName: "Test",
      milestoneGoal: "Test",
      workItemTitles: ["Test"],
    });

    expect(result.needsTdd).toBe(true);
    expect(result.rationale).toContain("default");
  });
});
