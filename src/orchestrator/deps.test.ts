import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRunnerDeps } from "./deps.js";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import type { EventBus } from "../daemon/bus.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("orchestrator-deps-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test",
      language: "TypeScript",
      languages: ["TypeScript"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
};

const mockBus = (): EventBus => ({
  publish: vi.fn(),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }) as any),
  ofType: vi.fn(() => ({ unsubscribe: vi.fn() }) as any),
  events$: {} as any,
  dispose: vi.fn(),
  isDisposed: vi.fn().mockReturnValue(false),
});

const mockClient = () =>
  ({
    complete: vi.fn().mockResolvedValue({
      content: "{}",
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
    }),
  }) as any;

describe("buildRunnerDeps", () => {
  it("returns an object with all required RunnerDeps fields", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();
    const client = mockClient();

    const deps = buildRunnerDeps(dir, bus, client);

    expect(typeof deps.syncIntake).toBe("function");
    expect(typeof deps.loadWorkItems).toBe("function");
    expect(typeof deps.suggestGrouping).toBe("function");
    expect(typeof deps.assessTdd).toBe("function");
    expect(typeof deps.createMilestoneEntry).toBe("function");
    expect(typeof deps.createPlan).toBe("function");
    expect(typeof deps.getSessionId).toBe("function");
    expect(typeof deps.executeTasks).toBe("function");
    expect(typeof deps.runQualityGates).toBe("function");
    expect(typeof deps.runReviewConvergence).toBe("function");
    expect(typeof deps.runMilestoneCheck).toBe("function");
    expect(typeof deps.runMilestoneComplete).toBe("function");
    expect(typeof deps.listPendingDecisions).toBe("function");
    expect(typeof deps.createDecision).toBe("function");
    expect(typeof deps.notify).toBe("function");
    expect(typeof deps.saveContext).toBe("function");
    expect(typeof deps.emitEvent).toBe("function");
  });

  it("loadWorkItems returns work items from intake store", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();
    const client = mockClient();

    // Write a work item to the intake store
    const intakeDir = join(dir, ".telesis", "intake");
    mkdirSync(intakeDir, { recursive: true });
    const workItem = {
      id: "wi-test-1",
      title: "Test work item",
      body: "Test body",
      source: "github",
      sourceId: "1",
      sourceUrl: "https://github.com/test/test/issues/1",
      labels: [],
      status: "pending",
      importedAt: "2026-03-15T00:00:00Z",
    };
    writeFileSync(
      join(intakeDir, "wi-test-1.json"),
      JSON.stringify(workItem) + "\n",
    );

    const deps = buildRunnerDeps(dir, bus, client);
    const items = deps.loadWorkItems(["wi-test-1"]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("wi-test-1");
    expect(items[0].title).toBe("Test work item");
  });

  it("listPendingDecisions delegates to decisions module", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();
    const client = mockClient();

    const deps = buildRunnerDeps(dir, bus, client);
    const pending = deps.listPendingDecisions();

    // No decisions created yet — should return empty
    expect(pending).toEqual([]);
  });

  it("saveContext delegates to persistence module", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();
    const client = mockClient();

    const deps = buildRunnerDeps(dir, bus, client);
    const ctx = {
      state: "idle" as const,
      workItemIds: [],
      updatedAt: new Date().toISOString(),
    };

    // Should not throw
    deps.saveContext(ctx);
  });

  it("emitEvent publishes to the bus", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();
    const client = mockClient();

    const deps = buildRunnerDeps(dir, bus, client);
    deps.emitEvent({
      fromState: "idle",
      toState: "intake",
    });

    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "orchestrator:state_changed",
        source: "orchestrator",
      }),
    );
  });

  it("notify does not throw", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();
    const client = mockClient();

    const deps = buildRunnerDeps(dir, bus, client);
    expect(() => deps.notify("Test", "test message")).not.toThrow();
  });
});
