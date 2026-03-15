import { describe, it, expect } from "vitest";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse } from "../agent/model/types.js";
import { createPlanFromWorkItem } from "./create.js";
import type { WorkItem } from "../intake/types.js";
import type { Plan } from "./types.js";

const makeTempDir = useTempDir("plan-create");

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  writeFileSync(
    join(rootDir, ".telesis", "config.yml"),
    "project:\n  name: test-project\n  owner: test\n  languages:\n  - TypeScript\n  status: active\n  repo: github.com/test/test\n",
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
  body: "Implement JWT-based auth.",
  labels: ["feature"],
  status: "approved",
  importedAt: "2026-03-13T00:00:00.000Z",
  ...overrides,
});

const VALID_TASKS_JSON = JSON.stringify([
  {
    id: "task-1",
    title: "Create auth module",
    description: "Set up the authentication module structure.",
    dependsOn: [],
  },
  {
    id: "task-2",
    title: "Add JWT verification",
    description: "Implement JWT token verification middleware.",
    dependsOn: ["task-1"],
  },
]);

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

describe("createPlanFromWorkItem", () => {
  it("creates a draft plan and persists it", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const client = makeClient(VALID_TASKS_JSON);

    const plan = await createPlanFromWorkItem(client, rootDir, makeWorkItem());

    expect(plan.status).toBe("draft");
    expect(plan.workItemId).toBe("wi-001");
    expect(plan.title).toBe("Add user authentication");
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]!.status).toBe("pending");
    expect(plan.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50 });

    // Verify persisted to disk
    const plansDir = join(rootDir, ".telesis", "plans");
    const files = readdirSync(plansDir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);

    const stored: Plan = JSON.parse(
      readFileSync(join(plansDir, files[0]!), "utf-8"),
    );
    expect(stored.id).toBe(plan.id);
    expect(stored.tasks).toHaveLength(2);
  });

  it("generates a unique plan ID", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const plan1 = await createPlanFromWorkItem(
      makeClient(VALID_TASKS_JSON),
      rootDir,
      makeWorkItem({ id: "wi-001" }),
    );
    const plan2 = await createPlanFromWorkItem(
      makeClient(VALID_TASKS_JSON),
      rootDir,
      makeWorkItem({ id: "wi-002" }),
    );

    expect(plan1.id).not.toBe(plan2.id);
  });

  it("passes model and maxTasks to planner", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const plan = await createPlanFromWorkItem(
      makeClient(VALID_TASKS_JSON),
      rootDir,
      makeWorkItem(),
      "claude-opus-4-6",
      5,
    );

    expect(plan.model).toBe("claude-opus-4-6");
  });

  it("propagates planner errors", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const client: ModelClient = {
      complete: async () => {
        throw new Error("API rate limit");
      },
      completeStream: async function* () {
        throw new Error("API rate limit");
      },
    };

    await expect(
      createPlanFromWorkItem(client, rootDir, makeWorkItem()),
    ).rejects.toThrow("API rate limit");
  });
});
