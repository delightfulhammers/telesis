import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import type { AgentAdapter } from "../dispatch/adapter.js";
import type { AgentEvent } from "../dispatch/types.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse, TokenUsage } from "../agent/model/types.js";
import type { ValidationConfig } from "../validation/types.js";
import { executePlan } from "./executor.js";
import { createPlan, loadPlan } from "./store.js";
import type { Plan, PlanTask } from "./types.js";

const makeTempDir = useTempDir("executor");

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

const makeTask = (
  id: string,
  deps: string[] = [],
  status: PlanTask["status"] = "pending",
): PlanTask => ({
  id,
  title: `Task ${id}`,
  description: `Do the thing for ${id}`,
  dependsOn: deps,
  status,
});

const makePlan = (overrides?: Partial<Plan>): Plan => ({
  id: randomUUID(),
  workItemId: randomUUID(),
  title: "Test plan",
  status: "approved",
  tasks: [makeTask("task-1"), makeTask("task-2", ["task-1"])],
  createdAt: new Date().toISOString(),
  approvedAt: new Date().toISOString(),
  ...overrides,
});

/** Fake adapter that completes immediately */
const makeSuccessAdapter = (): AgentAdapter => ({
  createSession: async () => "session-ok",
  prompt: async (
    _agent: string,
    _name: string,
    _text: string,
    _cwd: string,
    onEvent: (event: AgentEvent) => void,
  ) => {
    onEvent({
      eventVersion: "1",
      sessionId: "test",
      requestId: "test",
      seq: 1,
      stream: "main",
      type: "output",
      text: "done",
    } as AgentEvent);
  },
  cancel: async () => {},
  closeSession: async () => {},
});

/** Fake adapter that fails on a specific task */
const makeFailOnTaskAdapter = (failTaskId: string): AgentAdapter => {
  let promptCount = 0;
  return {
    createSession: async () => "session-ok",
    prompt: async (
      _agent: string,
      _name: string,
      text: string,
      _cwd: string,
      _onEvent: (event: AgentEvent) => void,
    ) => {
      promptCount++;
      if (text.includes(failTaskId)) {
        throw new Error(`Agent failed on ${failTaskId}`);
      }
    },
    cancel: async () => {},
    closeSession: async () => {},
  };
};

describe("executePlan", () => {
  it("executes all tasks in topological order", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan();
    createPlan(rootDir, plan);

    const result = await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    expect(result.status).toBe("completed");
    expect(result.completedTasks).toBe(2);
    expect(result.totalTasks).toBe(2);

    const loaded = loadPlan(rootDir, plan.id);
    expect(loaded?.status).toBe("completed");
    expect(loaded?.tasks.every((t) => t.status === "completed")).toBe(true);
  });

  it("stops on task failure and marks plan as failed", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      tasks: [
        makeTask("task-1"),
        makeTask("task-2", ["task-1"]),
        makeTask("task-3", ["task-2"]),
      ],
    });
    createPlan(rootDir, plan);

    const adapter = makeFailOnTaskAdapter("task-2");

    const result = await executePlan({ rootDir, adapter, agent: "test" }, plan);

    expect(result.status).toBe("failed");
    expect(result.completedTasks).toBe(1);

    const loaded = loadPlan(rootDir, plan.id);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.tasks.find((t) => t.id === "task-1")?.status).toBe(
      "completed",
    );
    expect(loaded?.tasks.find((t) => t.id === "task-2")?.status).toBe("failed");
    expect(loaded?.tasks.find((t) => t.id === "task-3")?.status).toBe(
      "pending",
    );
  });

  it("skips completed tasks on resume (crash recovery)", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      status: "approved",
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"]),
      ],
    });
    createPlan(rootDir, plan);

    const promptSpy = vi.fn();
    const adapter: AgentAdapter = {
      createSession: async () => "session-ok",
      prompt: async (_a, _n, text, _c, onEvent) => {
        promptSpy(text);
        onEvent({
          eventVersion: "1",
          sessionId: "test",
          requestId: "test",
          seq: 1,
          stream: "main",
          type: "output",
          text: "done",
        } as AgentEvent);
      },
      cancel: async () => {},
      closeSession: async () => {},
    };

    const result = await executePlan({ rootDir, adapter, agent: "test" }, plan);

    expect(result.status).toBe("completed");
    // Only task-2 should have been dispatched
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(promptSpy.mock.calls[0][0]).toContain("task-2");
  });

  it("rejects non-approved plans", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({ status: "draft" });
    createPlan(rootDir, plan);

    await expect(
      executePlan(
        { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
        plan,
      ),
    ).rejects.toThrow(/expected "approved"/);
  });

  it("allows re-execution of failed plans", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      status: "failed",
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"]),
      ],
    });
    createPlan(rootDir, plan);

    const result = await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    expect(result.status).toBe("completed");
  });

  it("emits plan events", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      tasks: [makeTask("task-1")],
    });
    createPlan(rootDir, plan);

    const events: string[] = [];
    const onEvent = (event: { type: string }) => events.push(event.type);

    await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test", onEvent },
      plan,
    );

    expect(events).toContain("plan:executing");
    expect(events).toContain("plan:task:started");
    expect(events).toContain("plan:task:completed");
    expect(events).toContain("plan:completed");
  });

  it("includes predecessor context in task prompts", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      tasks: [makeTask("task-1"), makeTask("task-2", ["task-1"])],
    });
    createPlan(rootDir, plan);

    const prompts: string[] = [];
    const adapter: AgentAdapter = {
      createSession: async () => "session-ok",
      prompt: async (_a, _n, text, _c, onEvent) => {
        prompts.push(text);
        onEvent({
          eventVersion: "1",
          sessionId: "test",
          requestId: "test",
          seq: 1,
          stream: "main",
          type: "output",
          text: "done",
        } as AgentEvent);
      },
      cancel: async () => {},
      closeSession: async () => {},
    };

    await executePlan({ rootDir, adapter, agent: "test" }, plan);

    // Second task prompt should mention task-1 was completed
    expect(prompts[1]).toContain("Task task-1");
    expect(prompts[1]).toContain("completed");
  });

  it("normalizes 'running' tasks to 'pending' on resume", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      status: "executing",
      startedAt: "2026-03-01T00:00:00.000Z",
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"], "running"),
        makeTask("task-3", ["task-2"]),
      ],
    });
    createPlan(rootDir, plan);

    const result = await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    expect(result.status).toBe("completed");
    expect(result.completedTasks).toBe(3);

    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.tasks.find((t) => t.id === "task-2")!.status).toBe(
      "completed",
    );
  });

  it("preserves original startedAt on resume", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const originalStart = "2026-03-01T00:00:00.000Z";
    const plan = makePlan({
      status: "failed",
      startedAt: originalStart,
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"]),
      ],
    });
    createPlan(rootDir, plan);

    await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.startedAt).toBe(originalStart);
  });

  it("allows re-execution of escalated plans", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      status: "escalated",
      tasks: [
        makeTask("task-1", [], "completed"),
        makeTask("task-2", ["task-1"], "escalated"),
      ],
    });
    createPlan(rootDir, plan);

    const result = await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    expect(result.status).toBe("completed");
    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.tasks.find((t) => t.id === "task-2")?.status).toBe(
      "completed",
    );
  });

  it("skips 'skipped' tasks on execution", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    const plan = makePlan({
      tasks: [
        makeTask("task-1", [], "completed"),
        { ...makeTask("task-2", ["task-1"]), status: "skipped" as const },
        makeTask("task-3", ["task-1"]),
      ],
    });
    createPlan(rootDir, plan);

    const result = await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    expect(result.status).toBe("completed");
    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.tasks.find((t) => t.id === "task-2")?.status).toBe("skipped");
    expect(stored.tasks.find((t) => t.id === "task-3")?.status).toBe(
      "completed",
    );
  });
});

// --- Validation-specific tests ---

const makeUsage = (): TokenUsage => ({
  inputTokens: 100,
  outputTokens: 50,
});

const makeCompletionResponse = (content: string): CompletionResponse => ({
  content,
  usage: makeUsage(),
  durationMs: 100,
});

/** Build a mock ModelClient that returns a fixed validation response */
const makeValidationClient = (
  verdicts: Array<{
    passed: boolean;
    criteria: Array<{ criterion: string; met: boolean; evidence: string }>;
    summary: string;
  }>,
): ModelClient => {
  let callIndex = 0;
  return {
    complete: async () => {
      const verdict = verdicts[callIndex] ?? verdicts[verdicts.length - 1]!;
      callIndex++;
      return makeCompletionResponse(JSON.stringify(verdict));
    },
    completeStream: async function* () {},
  };
};

/** Initialize a git repo so captureRef/diffSinceRef work */
const initGitRepo = (rootDir: string): void => {
  execFileSync("git", ["init"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "test@test.com"], {
    cwd: rootDir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: rootDir });
  writeFileSync(join(rootDir, "README.md"), "# Test\n");
  execFileSync("git", ["add", "."], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: rootDir });
};

/** Adapter that makes a git commit (so validation has a diff to inspect) */
const makeCommittingAdapter = (): AgentAdapter => ({
  createSession: async () => "session-ok",
  prompt: async (
    _agent: string,
    _name: string,
    _text: string,
    cwd: string,
    onEvent: (event: AgentEvent) => void,
  ) => {
    // Create a file and commit it, simulating agent work
    writeFileSync(
      join(cwd, `output-${Date.now()}.ts`),
      "export const x = 1;\n",
    );
    execFileSync("git", ["add", "."], { cwd });
    execFileSync("git", ["commit", "-m", "agent work"], { cwd });

    onEvent({
      eventVersion: "1",
      sessionId: "test",
      requestId: "test",
      seq: 1,
      stream: "main",
      type: "output",
      text: "done",
    } as AgentEvent);
  },
  cancel: async () => {},
  closeSession: async () => {},
});

describe("executePlan with validation", () => {
  it("passes validation on first try", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    initGitRepo(rootDir);

    const plan = makePlan({ tasks: [makeTask("task-1")] });
    createPlan(rootDir, plan);

    const client = makeValidationClient([
      {
        passed: true,
        criteria: [{ criterion: "Test", met: true, evidence: "ok" }],
        summary: "All good",
      },
    ]);

    const validationConfig: ValidationConfig = { maxRetries: 3 };
    const events: string[] = [];
    const onEvent = (event: { type: string }) => events.push(event.type);

    const result = await executePlan(
      {
        rootDir,
        adapter: makeCommittingAdapter(),
        agent: "test",
        modelClient: client,
        validationConfig,
        onEvent,
      },
      plan,
    );

    expect(result.status).toBe("completed");
    expect(result.completedTasks).toBe(1);
    expect(events).toContain("validation:started");
    expect(events).toContain("validation:passed");

    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.tasks[0]!.validationAttempts).toBe(1);
  });

  it("correction succeeds on second attempt", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    initGitRepo(rootDir);

    const plan = makePlan({ tasks: [makeTask("task-1")] });
    createPlan(rootDir, plan);

    const client = makeValidationClient([
      // First validation fails
      {
        passed: false,
        criteria: [{ criterion: "Feature", met: false, evidence: "missing" }],
        summary: "Not done",
      },
      // Second validation (after correction) passes
      {
        passed: true,
        criteria: [{ criterion: "Feature", met: true, evidence: "done" }],
        summary: "Fixed",
      },
    ]);

    const validationConfig: ValidationConfig = { maxRetries: 3 };
    const events: string[] = [];
    const onEvent = (event: { type: string }) => events.push(event.type);

    const result = await executePlan(
      {
        rootDir,
        adapter: makeCommittingAdapter(),
        agent: "test",
        modelClient: client,
        validationConfig,
        onEvent,
      },
      plan,
    );

    expect(result.status).toBe("completed");
    expect(events).toContain("validation:failed");
    expect(events).toContain("validation:correction:started");
    expect(events).toContain("validation:passed");

    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.tasks[0]!.validationAttempts).toBe(2);
    expect(stored.tasks[0]!.correctionSessionIds).toBeDefined();
    expect(stored.tasks[0]!.correctionSessionIds!.length).toBeGreaterThan(0);
  });

  it("escalates after exhausting retries", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    initGitRepo(rootDir);

    const plan = makePlan({ tasks: [makeTask("task-1")] });
    createPlan(rootDir, plan);

    // All validations fail
    const client = makeValidationClient([
      {
        passed: false,
        criteria: [
          { criterion: "Feature", met: false, evidence: "still missing" },
        ],
        summary: "Still not done",
      },
    ]);

    const validationConfig: ValidationConfig = { maxRetries: 2 };
    const events: string[] = [];
    const onEvent = (event: { type: string }) => events.push(event.type);

    const result = await executePlan(
      {
        rootDir,
        adapter: makeCommittingAdapter(),
        agent: "test",
        modelClient: client,
        validationConfig,
        onEvent,
      },
      plan,
    );

    expect(result.status).toBe("escalated");
    expect(events).toContain("validation:escalated");

    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.status).toBe("escalated");
    expect(stored.tasks[0]!.status).toBe("escalated");
    expect(stored.tasks[0]!.validationAttempts).toBe(2);
  });

  it("skips validation when maxRetries is 0 (--no-validate)", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    initGitRepo(rootDir);

    const plan = makePlan({ tasks: [makeTask("task-1")] });
    createPlan(rootDir, plan);

    // Client should never be called
    const client: ModelClient = {
      complete: async () => {
        throw new Error("Should not be called");
      },
      completeStream: async function* () {},
    };

    const validationConfig: ValidationConfig = { maxRetries: 0 };
    const events: string[] = [];
    const onEvent = (event: { type: string }) => events.push(event.type);

    const result = await executePlan(
      {
        rootDir,
        adapter: makeCommittingAdapter(),
        agent: "test",
        modelClient: client,
        validationConfig,
        onEvent,
      },
      plan,
    );

    expect(result.status).toBe("completed");
    expect(events).not.toContain("validation:started");
  });

  it("milestone gate pauses plan at awaiting_gate", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);
    initGitRepo(rootDir);

    const plan = makePlan({ tasks: [makeTask("task-1")] });
    createPlan(rootDir, plan);

    const client = makeValidationClient([
      {
        passed: true,
        criteria: [{ criterion: "Test", met: true, evidence: "ok" }],
        summary: "All good",
      },
    ]);

    const validationConfig: ValidationConfig = {
      maxRetries: 1,
      enableGates: true,
    };
    const events: string[] = [];
    const onEvent = (event: { type: string }) => events.push(event.type);

    const result = await executePlan(
      {
        rootDir,
        adapter: makeCommittingAdapter(),
        agent: "test",
        modelClient: client,
        validationConfig,
        onEvent,
      },
      plan,
    );

    expect(result.status).toBe("awaiting_gate");
    expect(events).toContain("plan:awaiting_gate");
    expect(events).not.toContain("plan:completed");

    const stored = loadPlan(rootDir, plan.id)!;
    expect(stored.status).toBe("awaiting_gate");
  });

  it("without modelClient, runs without validation (backward compat)", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const plan = makePlan({ tasks: [makeTask("task-1")] });
    createPlan(rootDir, plan);

    const result = await executePlan(
      { rootDir, adapter: makeSuccessAdapter(), agent: "test" },
      plan,
    );

    expect(result.status).toBe("completed");
  });
});
