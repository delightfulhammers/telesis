import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { useTempDir } from "../test-utils.js";
import { approveWorkItem, skipWorkItem } from "./approve.js";
import { createWorkItem, loadWorkItem } from "./store.js";
import type { WorkItem } from "./types.js";
import type { AgentAdapter } from "../dispatch/adapter.js";
import type { AgentEvent } from "../dispatch/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { clearActiveSessions } from "../dispatch/dispatcher.js";

const makeTempDir = useTempDir("intake-approve");

afterEach(() => {
  clearActiveSessions();
});

const makeItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: "item-abc-123",
  source: "github",
  sourceId: "42",
  sourceUrl: "https://github.com/owner/repo/issues/42",
  title: "Fix login bug",
  body: "The login form crashes on submit",
  labels: ["bug"],
  status: "pending",
  importedAt: "2026-03-13T10:00:00.000Z",
  ...overrides,
});

const makeEvent = (seq: number, type = "thinking"): AgentEvent => ({
  eventVersion: 1,
  sessionId: "s1",
  requestId: "r1",
  seq,
  stream: "main",
  type,
});

/** Set up a minimal project so dispatch context assembly works */
const setupProject = (root: string): void => {
  mkdirSync(join(root, ".telesis"), { recursive: true });
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "docs", "tdd"), { recursive: true });
  mkdirSync(join(root, "docs", "context"), { recursive: true });
  writeFileSync(
    join(root, ".telesis", "config.yml"),
    `project:
  name: TestProject
  owner: TestOwner
  language: TypeScript
  status: active
  repo: github.com/test/test`,
  );
};

const createFakeAdapter = (
  events: readonly AgentEvent[] = [makeEvent(1), makeEvent(2, "output")],
): AgentAdapter => ({
  createSession: async () => "fake-session",
  prompt: async (_agent, _name, _text, _cwd, onEvent) => {
    for (const event of events) {
      onEvent(event);
    }
  },
  cancel: async () => {},
  closeSession: async () => {},
});

const createFailingAdapter = (error: string): AgentAdapter => ({
  createSession: async () => "fake-session",
  prompt: async () => {
    throw new Error(error);
  },
  cancel: async () => {},
  closeSession: async () => {},
});

describe("approveWorkItem", () => {
  it("transitions item through approved → dispatching → completed", async () => {
    const root = makeTempDir();
    setupProject(root);
    const item = makeItem();
    createWorkItem(root, item);

    const adapter = createFakeAdapter();
    const result = await approveWorkItem(
      root,
      item.id,
      { rootDir: root, adapter },
      "claude",
    );

    expect(result.status).toBe("completed");
    expect(result.approvedAt).toBeDefined();
    expect(result.dispatchedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });

  it("transitions to failed on dispatch error", async () => {
    const root = makeTempDir();
    setupProject(root);
    const item = makeItem();
    createWorkItem(root, item);

    const adapter = createFailingAdapter("agent crashed");
    const result = await approveWorkItem(
      root,
      item.id,
      { rootDir: root, adapter },
      "claude",
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("agent crashed");
    expect(result.completedAt).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });

  it("transitions to failed when dispatch() throws", async () => {
    const root = makeTempDir();
    setupProject(root);
    const item = makeItem();
    createWorkItem(root, item);

    const throwingAdapter = createFakeAdapter();
    // Fill up active sessions to trigger max-concurrent error
    const events: TelesisDaemonEvent[] = [];
    const result = await approveWorkItem(
      root,
      item.id,
      { rootDir: root, adapter: throwingAdapter, maxConcurrent: 0 },
      "claude",
      (e) => events.push(e),
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("max concurrent");
    expect(result.sessionId).toBeUndefined();
    expect(events.map((e) => e.type)).toContain("intake:item:failed");
  });

  it("throws when item does not exist", async () => {
    const root = makeTempDir();
    setupProject(root);

    const adapter = createFakeAdapter();
    await expect(
      approveWorkItem(
        root,
        "nonexistent",
        { rootDir: root, adapter },
        "claude",
      ),
    ).rejects.toThrow('No work item matching "nonexistent"');
  });

  it("throws when item is not pending", async () => {
    const root = makeTempDir();
    setupProject(root);
    const item = makeItem({ status: "completed" });
    createWorkItem(root, item);

    const adapter = createFakeAdapter();
    await expect(
      approveWorkItem(root, item.id, { rootDir: root, adapter }, "claude"),
    ).rejects.toThrow('expected "pending"');
  });

  it("emits approval and dispatch events", async () => {
    const root = makeTempDir();
    setupProject(root);
    const item = makeItem();
    createWorkItem(root, item);

    const events: TelesisDaemonEvent[] = [];
    const adapter = createFakeAdapter();
    await approveWorkItem(
      root,
      item.id,
      { rootDir: root, adapter },
      "claude",
      (e) => events.push(e),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("intake:item:approved");
    expect(types).toContain("intake:item:dispatched");
    expect(types).toContain("intake:item:completed");
  });

  it("persists state changes to store", async () => {
    const root = makeTempDir();
    setupProject(root);
    const item = makeItem();
    createWorkItem(root, item);

    const adapter = createFakeAdapter();
    await approveWorkItem(root, item.id, { rootDir: root, adapter }, "claude");

    const loaded = loadWorkItem(root, item.id);
    expect(loaded?.status).toBe("completed");
    expect(loaded?.sessionId).toBeDefined();
  });
});

describe("skipWorkItem", () => {
  it("transitions pending item to skipped", () => {
    const root = makeTempDir();
    const item = makeItem();
    createWorkItem(root, item);

    const result = skipWorkItem(root, item.id);

    expect(result.status).toBe("skipped");
    expect(loadWorkItem(root, item.id)?.status).toBe("skipped");
  });

  it("throws when item does not exist", () => {
    const root = makeTempDir();
    expect(() => skipWorkItem(root, "nonexistent")).toThrow(
      'No work item matching "nonexistent"',
    );
  });

  it("throws when item is not pending", () => {
    const root = makeTempDir();
    const item = makeItem({ status: "approved" });
    createWorkItem(root, item);

    expect(() => skipWorkItem(root, item.id)).toThrow('expected "pending"');
  });

  it("emits intake:item:skipped event", () => {
    const root = makeTempDir();
    const item = makeItem();
    createWorkItem(root, item);

    const events: TelesisDaemonEvent[] = [];
    skipWorkItem(root, item.id, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("intake:item:skipped");
  });
});
