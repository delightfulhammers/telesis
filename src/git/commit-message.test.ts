import { describe, it, expect } from "vitest";
import { generateCommitMessage } from "./commit-message.js";
import type { Plan } from "../plan/types.js";
import type { WorkItem } from "../intake/types.js";

const makePlan = (overrides?: Partial<Plan>): Plan => ({
  id: "plan-001-uuid-full-length-here-1234",
  workItemId: "wi-001-uuid-full-length-here-12345",
  title: "Implement user authentication",
  status: "completed",
  tasks: [
    {
      id: "task-1",
      title: "Add login endpoint",
      description: "Create POST /login",
      dependsOn: [],
      status: "completed",
    },
    {
      id: "task-2",
      title: "Add auth middleware",
      description: "JWT verification middleware",
      dependsOn: ["task-1"],
      status: "completed",
    },
  ],
  createdAt: "2026-03-13T00:00:00Z",
  ...overrides,
});

const makeWorkItem = (overrides?: Partial<WorkItem>): WorkItem => ({
  id: "wi-001-uuid-full-length-here-12345",
  source: "github",
  sourceId: "42",
  sourceUrl: "https://github.com/owner/repo/issues/42",
  title: "Add user authentication",
  body: "We need login/logout functionality",
  labels: ["feature"],
  status: "pending",
  importedAt: "2026-03-13T00:00:00Z",
  ...overrides,
});

describe("generateCommitMessage", () => {
  it("generates conventional commit with issue reference", () => {
    const message = generateCommitMessage(makePlan(), makeWorkItem());

    expect(message).toContain("feat: Add user authentication (#42)");
    expect(message).toContain("Plan: Implement user authentication");
    expect(message).toContain("Work item: wi-001-u");
    expect(message).toContain("Tasks: 2");
  });

  it("omits issue reference for non-github sources", () => {
    const workItem = makeWorkItem({
      source: "github" as const,
      sourceId: "",
    });
    // Simulate a non-github source by casting
    const nonGh = { ...workItem, source: "manual" } as unknown as WorkItem;

    const message = generateCommitMessage(makePlan(), nonGh);

    expect(message).toContain("feat: Add user authentication");
    expect(message).not.toContain("#");
  });

  it("includes plan title and task count", () => {
    const plan = makePlan({ title: "My custom plan title" });
    const message = generateCommitMessage(plan, makeWorkItem());

    expect(message).toContain("Plan: My custom plan title");
  });

  it("handles single task", () => {
    const plan = makePlan({
      tasks: [
        {
          id: "task-1",
          title: "Single task",
          description: "Only one",
          dependsOn: [],
          status: "completed",
        },
      ],
    });
    const message = generateCommitMessage(plan, makeWorkItem());

    expect(message).toContain("Tasks: 1");
  });
});
