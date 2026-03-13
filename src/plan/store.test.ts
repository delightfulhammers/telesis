import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  createPlan,
  updatePlan,
  loadPlan,
  listPlans,
  findByWorkItemId,
} from "./store.js";
import type { Plan, PlanTask } from "./types.js";

const makeTempDir = useTempDir("plan-store");

const makeTask = (id: string, deps: string[] = []): PlanTask => ({
  id,
  title: `Task ${id}`,
  description: `Description for ${id}`,
  dependsOn: deps,
  status: "pending",
});

const makePlan = (overrides?: Partial<Plan>): Plan => ({
  id: randomUUID(),
  workItemId: randomUUID(),
  title: "Test plan",
  status: "draft",
  tasks: [makeTask("task-1"), makeTask("task-2", ["task-1"])],
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("createPlan", () => {
  it("creates a plan file at the expected path", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);

    const data = readFileSync(
      join(root, ".telesis", "plans", `${plan.id}.json`),
      "utf-8",
    );
    const parsed = JSON.parse(data);
    expect(parsed.id).toBe(plan.id);
    expect(parsed.title).toBe("Test plan");
  });

  it("throws on duplicate create", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);
    expect(() => createPlan(root, plan)).toThrow(/already exists/);
  });

  it("creates the plans directory if missing", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);
    expect(loadPlan(root, plan.id)).not.toBeNull();
  });
});

describe("updatePlan", () => {
  it("overwrites the plan atomically", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);

    const updated: Plan = { ...plan, status: "approved" };
    updatePlan(root, updated);

    const loaded = loadPlan(root, plan.id);
    expect(loaded?.status).toBe("approved");
  });
});

describe("loadPlan", () => {
  it("returns null for non-existent plan", () => {
    const root = makeTempDir();
    expect(loadPlan(root, "nonexistent")).toBeNull();
  });

  it("loads by exact ID", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);
    expect(loadPlan(root, plan.id)?.id).toBe(plan.id);
  });

  it("loads by ID prefix", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);
    expect(loadPlan(root, plan.id.slice(0, 8))?.id).toBe(plan.id);
  });

  it("returns null for ambiguous prefix", () => {
    const root = makeTempDir();
    const id1 = "aaaa1111-0000-0000-0000-000000000001";
    const id2 = "aaaa1111-0000-0000-0000-000000000002";
    createPlan(root, makePlan({ id: id1 }));
    createPlan(root, makePlan({ id: id2 }));
    expect(loadPlan(root, "aaaa")).toBeNull();
  });

  it("returns null for empty prefix", () => {
    const root = makeTempDir();
    expect(loadPlan(root, "")).toBeNull();
  });
});

describe("listPlans", () => {
  it("returns empty array for missing directory", () => {
    const root = makeTempDir();
    expect(listPlans(root)).toEqual([]);
  });

  it("lists all plans sorted by createdAt descending", () => {
    const root = makeTempDir();
    const old = makePlan({ createdAt: "2026-01-01T00:00:00.000Z" });
    const recent = makePlan({ createdAt: "2026-03-01T00:00:00.000Z" });
    createPlan(root, old);
    createPlan(root, recent);

    const list = listPlans(root);
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe(recent.id);
    expect(list[1]!.id).toBe(old.id);
  });

  it("filters by single status", () => {
    const root = makeTempDir();
    createPlan(root, makePlan({ status: "draft" }));
    createPlan(root, makePlan({ status: "completed" }));

    const drafts = listPlans(root, { status: "draft" });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe("draft");
  });

  it("filters by multiple statuses", () => {
    const root = makeTempDir();
    createPlan(root, makePlan({ status: "draft" }));
    createPlan(root, makePlan({ status: "approved" }));
    createPlan(root, makePlan({ status: "completed" }));

    const active = listPlans(root, { status: ["draft", "approved"] });
    expect(active).toHaveLength(2);
  });

  it("skips corrupt JSON files", () => {
    const root = makeTempDir();
    const plan = makePlan();
    createPlan(root, plan);

    const { writeFileSync } = require("node:fs");
    writeFileSync(
      join(root, ".telesis", "plans", "corrupt.json"),
      "not valid json{{{",
    );

    const list = listPlans(root);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(plan.id);
  });
});

describe("findByWorkItemId", () => {
  it("finds a plan by work item ID", () => {
    const root = makeTempDir();
    const workItemId = randomUUID();
    const plan = makePlan({ workItemId });
    createPlan(root, plan);

    const found = findByWorkItemId(root, workItemId);
    expect(found?.id).toBe(plan.id);
  });

  it("returns null when no plan matches", () => {
    const root = makeTempDir();
    createPlan(root, makePlan());
    expect(findByWorkItemId(root, "nonexistent")).toBeNull();
  });
});
