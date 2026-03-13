import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse } from "../agent/model/types.js";
import { planWorkItem } from "./planner.js";
import type { WorkItem } from "../intake/types.js";

const makeTempDir = useTempDir("planner");

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  writeFileSync(
    join(rootDir, ".telesis", "config.yml"),
    "project:\n  name: test-project\n  owner: test\n  language: TypeScript\n  status: active\n  repo: github.com/test/test\n",
  );
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "context"), { recursive: true });
};

const makeWorkItem = (overrides?: Partial<WorkItem>): WorkItem => ({
  id: "wi-001",
  source: "github",
  sourceId: "42",
  sourceUrl: "https://github.com/test/test/issues/42",
  title: "Add user authentication",
  body: "Implement JWT-based authentication with login and signup endpoints.",
  labels: ["feature"],
  status: "approved",
  importedAt: "2026-03-13T00:00:00.000Z",
  ...overrides,
});

const makeClient = (responseContent: string): ModelClient => ({
  complete: async (): Promise<CompletionResponse> => ({
    content: responseContent,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 500,
  }),
  completeStream: async function* () {
    yield {
      type: "done" as const,
      response: {
        content: responseContent,
        usage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
    };
  },
});

const VALID_TASKS = JSON.stringify([
  {
    id: "task-1",
    title: "Create auth middleware",
    description: "Create src/auth/middleware.ts with JWT verification",
    dependsOn: [],
  },
  {
    id: "task-2",
    title: "Add login endpoint",
    description: "Create POST /api/login endpoint that returns JWT",
    dependsOn: ["task-1"],
  },
  {
    id: "task-3",
    title: "Add signup endpoint",
    description: "Create POST /api/signup endpoint with validation",
    dependsOn: ["task-1"],
  },
]);

describe("planWorkItem", () => {
  it("decomposes a work item into tasks", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const client = makeClient(VALID_TASKS);

    const result = await planWorkItem(client, rootDir, makeWorkItem());

    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]!.id).toBe("task-1");
    expect(result.tasks[1]!.dependsOn).toContain("task-1");
    expect(result.durationMs).toBe(500);
    expect(result.tokenUsage.inputTokens).toBe(100);
    expect(result.tokenUsage.outputTokens).toBe(50);
  });

  it("normalizes tasks with missing IDs", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const response = JSON.stringify([
      { title: "First task", description: "Do first thing", dependsOn: [] },
      {
        title: "Second task",
        description: "Do second thing",
        dependsOn: ["task-1"],
      },
    ]);
    const client = makeClient(response);

    const result = await planWorkItem(client, rootDir, makeWorkItem());

    expect(result.tasks[0]!.id).toBe("task-1");
    expect(result.tasks[1]!.id).toBe("task-2");
  });

  it("handles code-fenced JSON response", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const response = "```json\n" + VALID_TASKS + "\n```";
    const client = makeClient(response);

    const result = await planWorkItem(client, rootDir, makeWorkItem());
    expect(result.tasks).toHaveLength(3);
  });

  it("sets all tasks to pending status", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const client = makeClient(VALID_TASKS);

    const result = await planWorkItem(client, rootDir, makeWorkItem());
    expect(result.tasks.every((t) => t.status === "pending")).toBe(true);
  });

  it("throws on non-array response", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const client = makeClient('{"not": "an array"}');

    await expect(planWorkItem(client, rootDir, makeWorkItem())).rejects.toThrow(
      /not an array/,
    );
  });

  it("throws on cyclic dependencies", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const cyclic = JSON.stringify([
      {
        id: "task-1",
        title: "A",
        description: "A desc",
        dependsOn: ["task-2"],
      },
      {
        id: "task-2",
        title: "B",
        description: "B desc",
        dependsOn: ["task-1"],
      },
    ]);
    const client = makeClient(cyclic);

    await expect(planWorkItem(client, rootDir, makeWorkItem())).rejects.toThrow(
      /cycle/i,
    );
  });

  it("throws on empty task list", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const client = makeClient("[]");

    await expect(planWorkItem(client, rootDir, makeWorkItem())).rejects.toThrow(
      /at least one task/,
    );
  });

  it("filters non-string dependency values", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const response = JSON.stringify([
      {
        id: "task-1",
        title: "A",
        description: "A desc",
        dependsOn: [42, null, "task-2", true],
      },
      { id: "task-2", title: "B", description: "B desc", dependsOn: [] },
    ]);
    const client = makeClient(response);

    // Should not throw — non-string deps are filtered out, but task-2 is valid
    // task-1 depends on task-2 which exists, so this is valid (albeit reversed order)
    // Actually task-1 depends on task-2 creates a valid graph: task-2 first, then task-1
    const result = await planWorkItem(client, rootDir, makeWorkItem());
    expect(result.tasks[0]!.dependsOn).toEqual(["task-2"]);
  });
});
