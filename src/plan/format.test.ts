import { describe, it, expect } from "vitest";
import { formatPlanList, formatPlanDetail } from "./format.js";
import type { Plan, PlanTask } from "./types.js";

const makeTask = (
  id: string,
  deps: string[] = [],
  status: PlanTask["status"] = "pending",
): PlanTask => ({
  id,
  title: `Task ${id}`,
  description: `Description for ${id}`,
  dependsOn: deps,
  status,
});

const makePlan = (overrides?: Partial<Plan>): Plan => ({
  id: "aaaa1111-2222-3333-4444-555566667777",
  workItemId: "bbbb1111-2222-3333-4444-555566667777",
  title: "Implement auth system",
  status: "draft",
  tasks: [makeTask("task-1"), makeTask("task-2", ["task-1"])],
  createdAt: "2026-03-13T10:00:00.000Z",
  ...overrides,
});

describe("formatPlanList", () => {
  it("returns message for empty list", () => {
    expect(formatPlanList([])).toBe("No plans.");
  });

  it("formats a list with header", () => {
    const output = formatPlanList([makePlan()]);
    expect(output).toContain("ID");
    expect(output).toContain("STATUS");
    expect(output).toContain("TASKS");
    expect(output).toContain("aaaa1111");
    expect(output).toContain("draft");
    expect(output).toContain("0/2");
  });

  it("shows completed task counts", () => {
    const plan = makePlan({
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"]),
      ],
    });
    const output = formatPlanList([plan]);
    expect(output).toContain("1/2");
  });

  it("truncates long titles", () => {
    const plan = makePlan({ title: "A".repeat(60) });
    const output = formatPlanList([plan]);
    expect(output).toContain("A".repeat(49) + "…");
  });
});

describe("formatPlanDetail", () => {
  it("shows plan metadata", () => {
    const output = formatPlanDetail(makePlan());
    expect(output).toContain("aaaa1111-2222-3333-4444-555566667777");
    expect(output).toContain("Implement auth system");
    expect(output).toContain("draft");
    expect(output).toContain("bbbb1111-2222-3333-4444-555566667777");
  });

  it("shows task list with status icons", () => {
    const plan = makePlan({
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"], "running"),
        makeTask("task-3", ["task-2"], "failed"),
        makeTask("task-4", [], "skipped"),
        makeTask("task-5", []),
      ],
    });
    const output = formatPlanDetail(plan);
    expect(output).toContain("[x] task-1");
    expect(output).toContain("[>] task-2");
    expect(output).toContain("[!] task-3");
    expect(output).toContain("[-] task-4");
    expect(output).toContain("[ ] task-5");
  });

  it("shows dependency info on tasks", () => {
    const output = formatPlanDetail(makePlan());
    expect(output).toContain("(after: task-1)");
  });

  it("shows optional fields when present", () => {
    const plan = makePlan({
      approvedAt: "2026-03-13T11:00:00.000Z",
      model: "claude-sonnet-4-6",
      tokenUsage: { inputTokens: 1000, outputTokens: 200 },
      error: "task-2 failed",
    });
    const output = formatPlanDetail(plan);
    expect(output).toContain("Approved:");
    expect(output).toContain("claude-sonnet-4-6");
    expect(output).toContain("1000 in / 200 out");
    expect(output).toContain("task-2 failed");
  });

  it("omits optional fields when absent", () => {
    const output = formatPlanDetail(makePlan());
    expect(output).not.toContain("Approved:");
    expect(output).not.toContain("Model:");
    expect(output).not.toContain("Tokens:");
    expect(output).not.toContain("Error:");
  });

  it("shows completion count", () => {
    const plan = makePlan({
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"]),
      ],
    });
    const output = formatPlanDetail(plan);
    expect(output).toContain("1/2 complete");
  });
});
