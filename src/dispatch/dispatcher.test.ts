import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { useTempDir } from "../test-utils.js";
import {
  dispatch,
  clearActiveSessions,
  getActiveSessionCount,
} from "./dispatcher.js";
import type { AgentAdapter } from "./adapter.js";
import type { AgentEvent } from "./types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { loadSessionMeta, loadSessionEvents, listSessions } from "./store.js";

const makeTempDir = useTempDir("dispatcher");

/** Set up a minimal project so context assembly doesn't throw */
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

const makeEvent = (seq: number, type = "thinking"): AgentEvent => ({
  eventVersion: 1,
  sessionId: "s1",
  requestId: "r1",
  seq,
  stream: "main",
  type,
});

/** Fake adapter that emits a sequence of canned events */
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

/** Fake adapter that throws on prompt */
const createFailingAdapter = (error: string): AgentAdapter => ({
  createSession: async () => "fake-session",
  prompt: async () => {
    throw new Error(error);
  },
  cancel: async () => {},
  closeSession: async () => {},
});

describe("dispatch", () => {
  afterEach(() => {
    clearActiveSessions();
  });

  it("dispatches a task and returns completed result", async () => {
    const root = makeTempDir();
    setupProject(root);

    const result = await dispatch(
      { rootDir: root, adapter: createFakeAdapter() },
      "claude",
      "implement feature",
    );

    expect(result.status).toBe("completed");
    expect(result.eventCount).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.sessionId).toBeTruthy();
  });

  it("persists session meta and events", async () => {
    const root = makeTempDir();
    setupProject(root);

    const result = await dispatch(
      { rootDir: root, adapter: createFakeAdapter() },
      "claude",
      "implement feature",
    );

    const meta = loadSessionMeta(root, result.sessionId);
    expect(meta?.status).toBe("completed");
    expect(meta?.agent).toBe("claude");
    expect(meta?.task).toBe("implement feature");
    expect(meta?.eventCount).toBe(2);

    const { items } = loadSessionEvents(root, result.sessionId);
    expect(items).toHaveLength(2);
  });

  it("emits daemon events via onEvent callback", async () => {
    const root = makeTempDir();
    setupProject(root);

    const daemonEvents: TelesisDaemonEvent[] = [];

    await dispatch(
      {
        rootDir: root,
        adapter: createFakeAdapter([
          makeEvent(1, "thinking"),
          makeEvent(2, "tool_call"),
        ]),
        onEvent: (e) => daemonEvents.push(e),
      },
      "claude",
      "do something",
    );

    // Should have: session:started, agent:thinking, agent:tool_call, session:completed
    const types = daemonEvents.map((e) => e.type);
    expect(types).toContain("dispatch:session:started");
    expect(types).toContain("dispatch:agent:thinking");
    expect(types).toContain("dispatch:agent:tool_call");
    expect(types).toContain("dispatch:session:completed");
  });

  it("handles adapter failure gracefully", async () => {
    const root = makeTempDir();
    setupProject(root);

    const daemonEvents: TelesisDaemonEvent[] = [];

    const result = await dispatch(
      {
        rootDir: root,
        adapter: createFailingAdapter("agent crashed"),
        onEvent: (e) => daemonEvents.push(e),
      },
      "claude",
      "do something",
    );

    expect(result.status).toBe("failed");

    const meta = loadSessionMeta(root, result.sessionId);
    expect(meta?.status).toBe("failed");
    expect(meta?.error).toBe("agent crashed");

    const types = daemonEvents.map((e) => e.type);
    expect(types).toContain("dispatch:session:failed");
  });

  it("enforces concurrency limit", async () => {
    const root = makeTempDir();
    setupProject(root);

    // Adapter that never resolves (blocks the session)
    let resolvePrompt: (() => void) | null = null;
    const blockingAdapter: AgentAdapter = {
      createSession: async () => "blocked",
      prompt: async () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
      cancel: async () => {},
      closeSession: async () => {},
    };

    // Start a blocking dispatch
    const blocked = dispatch(
      { rootDir: root, adapter: blockingAdapter, maxConcurrent: 1 },
      "claude",
      "blocking task",
    );

    // Wait a tick for the session to register
    await new Promise((r) => setTimeout(r, 10));
    expect(getActiveSessionCount()).toBe(1);

    // Second dispatch should fail immediately
    await expect(
      dispatch(
        { rootDir: root, adapter: createFakeAdapter(), maxConcurrent: 1 },
        "claude",
        "second task",
      ),
    ).rejects.toThrow("max concurrent agents reached");

    // Clean up the blocking dispatch
    resolvePrompt?.();
    await blocked;
  });

  it("cleans up active session on failure", async () => {
    const root = makeTempDir();
    setupProject(root);

    await dispatch(
      { rootDir: root, adapter: createFailingAdapter("error") },
      "claude",
      "task",
    );

    expect(getActiveSessionCount()).toBe(0);
  });

  it("calls closeSession on adapter after completion", async () => {
    const root = makeTempDir();
    setupProject(root);

    let closedWith: { agent: string; name: string } | null = null;
    const adapter: AgentAdapter = {
      createSession: async () => "s",
      prompt: async (_a, _n, _t, _c, onEvent) => onEvent(makeEvent(1)),
      cancel: async () => {},
      closeSession: async (agent, name) => {
        closedWith = { agent, name };
      },
    };

    const result = await dispatch({ rootDir: root, adapter }, "claude", "task");

    expect(closedWith).not.toBeNull();
    expect(closedWith!.agent).toBe("claude");
    expect(closedWith!.name).toBe(result.sessionId);
  });

  it("calls closeSession on adapter after failure", async () => {
    const root = makeTempDir();
    setupProject(root);

    let closeSessionCalled = false;
    const adapter: AgentAdapter = {
      createSession: async () => "s",
      prompt: async () => {
        throw new Error("boom");
      },
      cancel: async () => {},
      closeSession: async () => {
        closeSessionCalled = true;
      },
    };

    await dispatch({ rootDir: root, adapter }, "claude", "task");
    expect(closeSessionCalled).toBe(true);
  });

  it("shows sessions in list after dispatch", async () => {
    const root = makeTempDir();
    setupProject(root);

    await dispatch(
      { rootDir: root, adapter: createFakeAdapter() },
      "claude",
      "task one",
    );
    await dispatch(
      { rootDir: root, adapter: createFakeAdapter() },
      "codex",
      "task two",
    );

    const sessions = listSessions(root);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.agent)).toContain("claude");
    expect(sessions.map((s) => s.agent)).toContain("codex");
  });
});
