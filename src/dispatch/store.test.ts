import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { useTempDir } from "../test-utils.js";
import {
  createSession,
  appendEvent,
  updateSessionMeta,
  loadSessionMeta,
  loadSessionEvents,
  listSessions,
} from "./store.js";
import type { AgentEvent, SessionMeta } from "./types.js";

const makeTempDir = useTempDir("dispatch-store");

const makeMeta = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  id: "abc-123-def",
  agent: "claude",
  task: "implement feature",
  status: "running",
  startedAt: "2026-03-12T10:00:00.000Z",
  eventCount: 0,
  ...overrides,
});

const makeEvent = (seq: number, type = "thinking"): AgentEvent => ({
  eventVersion: 1,
  sessionId: "abc-123-def",
  requestId: "r1",
  seq,
  stream: "main",
  type,
});

describe("session store", () => {
  it("creates session with meta and empty events file", () => {
    const root = makeTempDir();
    const meta = makeMeta();

    createSession(root, meta);

    const loaded = loadSessionMeta(root, meta.id);
    expect(loaded).toEqual(meta);

    const events = loadSessionEvents(root, meta.id);
    expect(events.items).toHaveLength(0);
    expect(events.invalidLineCount).toBe(0);
  });

  it("appends events to session JSONL", () => {
    const root = makeTempDir();
    createSession(root, makeMeta());

    appendEvent(root, "abc-123-def", makeEvent(1, "thinking"));
    appendEvent(root, "abc-123-def", makeEvent(2, "tool_call"));
    appendEvent(root, "abc-123-def", makeEvent(3, "output"));

    const { items } = loadSessionEvents(root, "abc-123-def");
    expect(items).toHaveLength(3);
    expect(items[0]!.seq).toBe(1);
    expect(items[1]!.type).toBe("tool_call");
    expect(items[2]!.seq).toBe(3);
  });

  it("atomically updates session metadata", () => {
    const root = makeTempDir();
    const meta = makeMeta();
    createSession(root, meta);

    const updated: SessionMeta = {
      ...meta,
      status: "completed",
      completedAt: "2026-03-12T10:05:00.000Z",
      eventCount: 42,
    };
    updateSessionMeta(root, updated);

    const loaded = loadSessionMeta(root, meta.id);
    expect(loaded?.status).toBe("completed");
    expect(loaded?.completedAt).toBe("2026-03-12T10:05:00.000Z");
    expect(loaded?.eventCount).toBe(42);
  });

  it("lists sessions sorted by startedAt descending", () => {
    const root = makeTempDir();

    createSession(
      root,
      makeMeta({
        id: "session-old",
        startedAt: "2026-03-12T09:00:00.000Z",
        task: "old task",
      }),
    );
    createSession(
      root,
      makeMeta({
        id: "session-new",
        startedAt: "2026-03-12T11:00:00.000Z",
        task: "new task",
      }),
    );
    createSession(
      root,
      makeMeta({
        id: "session-mid",
        startedAt: "2026-03-12T10:00:00.000Z",
        task: "mid task",
      }),
    );

    const sessions = listSessions(root);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]!.id).toBe("session-new");
    expect(sessions[1]!.id).toBe("session-mid");
    expect(sessions[2]!.id).toBe("session-old");
  });

  it("returns empty list when sessions directory does not exist", () => {
    const root = makeTempDir();
    expect(listSessions(root)).toEqual([]);
  });

  it("returns null for non-existent session", () => {
    const root = makeTempDir();
    expect(loadSessionMeta(root, "nonexistent")).toBeNull();
  });

  it("supports ID prefix matching for loadSessionMeta", () => {
    const root = makeTempDir();
    createSession(root, makeMeta({ id: "abc-123-def-456" }));

    const loaded = loadSessionMeta(root, "abc-123");
    expect(loaded?.id).toBe("abc-123-def-456");
  });

  it("supports ID prefix matching for loadSessionEvents", () => {
    const root = makeTempDir();
    createSession(root, makeMeta({ id: "abc-123-def-456" }));
    appendEvent(root, "abc-123-def-456", makeEvent(1));

    const { items } = loadSessionEvents(root, "abc-123");
    expect(items).toHaveLength(1);
  });

  it("returns null when prefix matches multiple sessions", () => {
    const root = makeTempDir();
    createSession(root, makeMeta({ id: "abc-111" }));
    createSession(root, makeMeta({ id: "abc-222" }));

    // Prefix "abc" matches both — ambiguous
    expect(loadSessionMeta(root, "abc")).toBeNull();
  });

  it("skips malformed event lines", () => {
    const root = makeTempDir();
    createSession(root, makeMeta());
    appendEvent(root, "abc-123-def", makeEvent(1));

    // Manually corrupt the events file
    appendFileSync(
      join(resolve(root), ".telesis/sessions/abc-123-def.events.jsonl"),
      "not json\n",
    );

    appendEvent(root, "abc-123-def", makeEvent(2));

    const { items, invalidLineCount } = loadSessionEvents(root, "abc-123-def");
    expect(items).toHaveLength(2);
    expect(invalidLineCount).toBe(1);
  });

  it("records failed session with error message", () => {
    const root = makeTempDir();
    const meta = makeMeta();
    createSession(root, meta);

    const failed: SessionMeta = {
      ...meta,
      status: "failed",
      error: "agent crashed unexpectedly",
      completedAt: "2026-03-12T10:01:00.000Z",
    };
    updateSessionMeta(root, failed);

    const loaded = loadSessionMeta(root, meta.id);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.error).toBe("agent crashed unexpectedly");
  });
});
