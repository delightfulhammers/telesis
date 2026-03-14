import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { useTempDir } from "../test-utils.js";
import { runPipeline } from "./run.js";
import type { RunDeps } from "./types.js";
import type { WorkItem } from "../intake/types.js";
import type { Plan } from "../plan/types.js";
import { createWorkItem } from "../intake/store.js";

const makeTempDir = useTempDir("pipeline-run");

/** Initialize a git repo with .telesis structure and everything committed */
const initTestRepo = (dir: string): void => {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# Test\n");
  mkdirSync(join(dir, ".telesis", "intake"), { recursive: true });
  mkdirSync(join(dir, ".telesis", "plans"), { recursive: true });
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir });
};

const makeWorkItem = (dir: string, overrides?: Partial<WorkItem>): WorkItem => {
  const item: WorkItem = {
    id: "wi-test-1234-5678-9012-abcdef012345",
    source: "github",
    sourceId: "42",
    sourceUrl: "https://github.com/owner/repo/issues/42",
    title: "Add authentication",
    body: "Add login/logout",
    labels: ["feature"],
    status: "pending",
    importedAt: "2026-03-13T00:00:00Z",
    ...overrides,
  };
  createWorkItem(dir, item);
  return item;
};

// Mock modules
vi.mock("../plan/create.js", () => ({
  createPlanFromWorkItem: vi.fn(),
}));

vi.mock("../plan/executor.js", () => ({
  executePlan: vi.fn(),
}));

vi.mock("../github/pr.js", () => ({
  createPullRequest: vi.fn(),
  closeIssue: vi.fn(),
}));

vi.mock("../github/environment.js", () => ({
  extractRepoContext: vi.fn(() => null),
}));

import { createPlanFromWorkItem } from "../plan/create.js";
import { executePlan } from "../plan/executor.js";

const mockCreatePlan = vi.mocked(createPlanFromWorkItem);
const mockExecutePlan = vi.mocked(executePlan);

const makeMockPlan = (overrides?: Partial<Plan>): Plan => ({
  id: "plan-test-1234-5678-9012-abcdef012345",
  workItemId: "wi-test-1234-5678-9012-abcdef012345",
  title: "Add authentication",
  status: "draft",
  tasks: [
    {
      id: "task-1",
      title: "Add login endpoint",
      description: "Create POST /login",
      dependsOn: [],
      status: "pending",
    },
  ],
  createdAt: "2026-03-13T00:00:00Z",
  ...overrides,
});

/** Commit all pending .telesis changes so hasChanges returns false */
const commitTelesisState = (dir: string): void => {
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "telesis state", "--allow-empty"], {
    cwd: dir,
  });
};

const makeDeps = (dir: string, overrides?: Partial<RunDeps>): RunDeps => ({
  rootDir: dir,
  adapter: {
    createSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    closeSession: vi.fn(),
  },
  agent: "claude",
  modelClient: {} as RunDeps["modelClient"],
  onEvent: vi.fn(),
  gitConfig: { pushAfterCommit: false },
  pipelineConfig: {},
  validationConfig: {},
  plannerConfig: {},
  dispatchConfig: {},
  confirm: vi.fn(async () => true),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPipeline", () => {
  it("returns error when work item not found", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);

    const deps = makeDeps(dir);
    const result = await runPipeline(deps, "nonexistent");

    expect(result.stage).toBe("failed");
    expect(result.error).toContain("No work item");
  });

  it("returns error when work item has wrong status", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir, { status: "completed" });

    const deps = makeDeps(dir);
    const result = await runPipeline(deps, "wi-test-1");

    expect(result.stage).toBe("failed");
    expect(result.error).toContain("expected");
  });

  it("returns error when user rejects plan", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);

    const deps = makeDeps(dir, {
      confirm: vi.fn(async () => false),
    });

    const result = await runPipeline(deps, "wi-test-1");

    expect(result.stage).toBe("failed");
    expect(result.error).toContain("rejected");
  });

  it("returns error when plan execution fails", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);
    mockExecutePlan.mockResolvedValueOnce({
      planId: plan.id,
      status: "failed",
      completedTasks: 0,
      totalTasks: 1,
      durationMs: 1000,
    });

    const deps = makeDeps(dir);
    const result = await runPipeline(deps, "wi-test-1");

    expect(result.stage).toBe("failed");
    expect(result.error).toContain("failed");
  });

  it("commits changes when execution produces them (commitToMain)", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);
    mockExecutePlan.mockImplementationOnce(async () => {
      // Simulate agent creating a file
      writeFileSync(join(dir, "new-feature.ts"), "export const x = 1;\n");
      return {
        planId: plan.id,
        status: "completed" as const,
        completedTasks: 1,
        totalTasks: 1,
        durationMs: 1000,
      };
    });

    const deps = makeDeps(dir, {
      gitConfig: { commitToMain: true, pushAfterCommit: false },
    });
    const result = await runPipeline(deps, "wi-test-1");

    expect(result.stage).toBe("completed");
    expect(result.commitResult).toBeDefined();
    expect(result.commitResult!.filesChanged).toBeGreaterThan(0);
    expect(result.pushResult).toBeUndefined();
  });

  it("creates branch when commitToMain is false", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);
    mockExecutePlan.mockImplementationOnce(async () => {
      writeFileSync(join(dir, "feature.ts"), "export const f = 1;\n");
      return {
        planId: plan.id,
        status: "completed" as const,
        completedTasks: 1,
        totalTasks: 1,
        durationMs: 1000,
      };
    });

    const deps = makeDeps(dir, {
      gitConfig: { commitToMain: false, pushAfterCommit: false },
    });
    const result = await runPipeline(deps, "wi-test-1");

    expect(result.stage).toBe("completed");
    expect(result.commitResult).toBeDefined();
    expect(result.commitResult!.branch).toContain("telesis/");
    expect(result.commitResult!.branch).toContain("add-authentication");
  });

  it("skips plan approval with autoApprove", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);
    commitTelesisState(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);
    mockExecutePlan.mockImplementationOnce(async () => {
      // Commit all telesis state changes so hasChanges returns false
      commitTelesisState(dir);
      return {
        planId: plan.id,
        status: "completed" as const,
        completedTasks: 1,
        totalTasks: 1,
        durationMs: 1000,
      };
    });

    const confirmFn = vi.fn(async () => true);
    const deps = makeDeps(dir, {
      pipelineConfig: { autoApprove: true },
      confirm: confirmFn,
    });

    const result = await runPipeline(deps, "wi-test-1");

    expect(result.stage).toBe("completed");
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("uses branch override when provided", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);
    mockExecutePlan.mockImplementationOnce(async () => {
      writeFileSync(join(dir, "feature.ts"), "export const f = 1;\n");
      return {
        planId: plan.id,
        status: "completed" as const,
        completedTasks: 1,
        totalTasks: 1,
        durationMs: 1000,
      };
    });

    const deps = makeDeps(dir, {
      gitConfig: { pushAfterCommit: false },
    });
    const result = await runPipeline(deps, "wi-test-1", "custom/branch");

    expect(result.stage).toBe("completed");
    expect(result.commitResult!.branch).toBe("custom/branch");
  });

  it("emits pipeline events throughout lifecycle", async () => {
    const dir = makeTempDir();
    initTestRepo(dir);
    makeWorkItem(dir);
    commitTelesisState(dir);

    const plan = makeMockPlan();
    mockCreatePlan.mockResolvedValueOnce(plan);
    mockExecutePlan.mockImplementationOnce(async () => {
      commitTelesisState(dir);
      return {
        planId: plan.id,
        status: "completed" as const,
        completedTasks: 1,
        totalTasks: 1,
        durationMs: 1000,
      };
    });

    const onEvent = vi.fn();
    const deps = makeDeps(dir, {
      pipelineConfig: { autoApprove: true },
      onEvent,
    });

    await runPipeline(deps, "wi-test-1");

    const eventTypes = onEvent.mock.calls.map(
      (call: unknown[]) => (call[0] as { type: string }).type,
    );
    expect(eventTypes).toContain("pipeline:started");
    expect(eventTypes).toContain("pipeline:stage_changed");
    expect(eventTypes).toContain("pipeline:completed");
  });
});
