import { describe, it, expect } from "vitest";
import { topologicalSort, validatePlanTasks } from "./validate.js";
import type { PlanTask } from "./types.js";

const makeTask = (
  id: string,
  deps: string[] = [],
  overrides?: Partial<PlanTask>,
): PlanTask => ({
  id,
  title: `Task ${id}`,
  description: `Description for ${id}`,
  dependsOn: deps,
  status: "pending",
  ...overrides,
});

describe("topologicalSort", () => {
  it("returns empty order for empty tasks", () => {
    const result = topologicalSort([]);
    expect(result).toEqual({ valid: true, order: [] });
  });

  it("sorts a single task", () => {
    const result = topologicalSort([makeTask("task-1")]);
    expect(result).toEqual({ valid: true, order: ["task-1"] });
  });

  it("sorts a linear chain", () => {
    const tasks = [
      makeTask("task-1"),
      makeTask("task-2", ["task-1"]),
      makeTask("task-3", ["task-2"]),
    ];
    const result = topologicalSort(tasks);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order).toEqual(["task-1", "task-2", "task-3"]);
    }
  });

  it("sorts a diamond dependency graph", () => {
    const tasks = [
      makeTask("task-1"),
      makeTask("task-2", ["task-1"]),
      makeTask("task-3", ["task-1"]),
      makeTask("task-4", ["task-2", "task-3"]),
    ];
    const result = topologicalSort(tasks);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order.indexOf("task-1")).toBeLessThan(
        result.order.indexOf("task-2"),
      );
      expect(result.order.indexOf("task-1")).toBeLessThan(
        result.order.indexOf("task-3"),
      );
      expect(result.order.indexOf("task-2")).toBeLessThan(
        result.order.indexOf("task-4"),
      );
      expect(result.order.indexOf("task-3")).toBeLessThan(
        result.order.indexOf("task-4"),
      );
    }
  });

  it("detects a simple cycle", () => {
    const tasks = [
      makeTask("task-1", ["task-2"]),
      makeTask("task-2", ["task-1"]),
    ];
    const result = topologicalSort(tasks);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("cycle");
      expect(result.cycle).toContain("task-1");
      expect(result.cycle).toContain("task-2");
    }
  });

  it("detects a cycle in a larger graph", () => {
    const tasks = [
      makeTask("task-1"),
      makeTask("task-2", ["task-1", "task-3"]),
      makeTask("task-3", ["task-2"]),
    ];
    const result = topologicalSort(tasks);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.cycle).toContain("task-2");
      expect(result.cycle).toContain("task-3");
      // task-1 is not part of the cycle
      expect(result.cycle).not.toContain("task-1");
    }
  });

  it("sorts independent tasks in original order", () => {
    const tasks = [makeTask("task-a"), makeTask("task-b"), makeTask("task-c")];
    const result = topologicalSort(tasks);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order).toEqual(["task-a", "task-b", "task-c"]);
    }
  });

  it("ignores orphan dependency refs in sort (validation catches them separately)", () => {
    const tasks = [makeTask("task-1", ["nonexistent"])];
    const result = topologicalSort(tasks);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order).toEqual(["task-1"]);
    }
  });
});

describe("validatePlanTasks", () => {
  it("returns no errors for valid tasks", () => {
    const tasks = [makeTask("task-1"), makeTask("task-2", ["task-1"])];
    expect(validatePlanTasks(tasks)).toEqual([]);
  });

  it("reports empty task list", () => {
    const errors = validatePlanTasks([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("at least one task");
  });

  it("reports duplicate IDs", () => {
    const tasks = [makeTask("task-1"), makeTask("task-1")];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("reports orphan dependency references", () => {
    const tasks = [makeTask("task-1", ["task-99"])];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("non-existent"))).toBe(true);
  });

  it("reports cycles", () => {
    const tasks = [
      makeTask("task-1", ["task-2"]),
      makeTask("task-2", ["task-1"]),
    ];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("reports missing title", () => {
    const tasks = [makeTask("task-1", [], { title: "" })];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("reports missing description", () => {
    const tasks = [makeTask("task-1", [], { description: "" })];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("reports missing ID", () => {
    const tasks = [makeTask("", [])];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("empty or missing ID"))).toBe(true);
  });

  it("accumulates multiple errors", () => {
    // Orphan dep + cycle (no structural errors, so dependency analysis runs)
    const tasks = [
      makeTask("task-1", ["task-99"]),
      makeTask("task-2", ["task-3"]),
      makeTask("task-3", ["task-2"]),
    ];
    const errors = validatePlanTasks(tasks);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.some((e) => e.includes("non-existent"))).toBe(true);
    expect(errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("short-circuits on duplicate IDs before dependency analysis", () => {
    const tasks = [
      makeTask("task-1", ["task-99"]),
      makeTask("task-1"), // duplicate
    ];
    const errors = validatePlanTasks(tasks);
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
    // Should not include orphan dep errors since we short-circuit
    expect(errors.some((e) => e.includes("non-existent"))).toBe(false);
  });
});
