import { describe, it, expect } from "vitest";
import { formatSessionList, formatSessionDetail } from "./format.js";
import type { SessionMeta, AgentEvent } from "./types.js";

const makeMeta = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  id: "abc-123-def-456-ghi-789",
  agent: "claude",
  task: "implement feature",
  status: "completed",
  startedAt: "2026-03-12T10:00:00.000Z",
  completedAt: "2026-03-12T10:05:00.000Z",
  eventCount: 42,
  ...overrides,
});

const makeEvent = (seq: number, type = "thinking"): AgentEvent => ({
  eventVersion: 1,
  sessionId: "abc-123",
  requestId: "r1",
  seq,
  stream: "main",
  type,
});

describe("formatSessionList", () => {
  it("returns message when no sessions", () => {
    expect(formatSessionList([])).toBe("No dispatch sessions.");
  });

  it("formats sessions as a table", () => {
    const sessions = [
      makeMeta({ id: "aaaa-1111", agent: "claude", task: "task one" }),
      makeMeta({
        id: "bbbb-2222",
        agent: "codex",
        task: "task two",
        status: "failed",
      }),
    ];

    const output = formatSessionList(sessions);

    expect(output).toContain("ID");
    expect(output).toContain("STATUS");
    expect(output).toContain("AGENT");
    expect(output).toContain("aaaa-111");
    expect(output).toContain("claude");
    expect(output).toContain("task one");
    expect(output).toContain("bbbb-222");
    expect(output).toContain("codex");
    expect(output).toContain("failed");
  });

  it("truncates long task descriptions", () => {
    const longTask = "a".repeat(100);
    const sessions = [makeMeta({ task: longTask })];

    const output = formatSessionList(sessions);

    // Should be truncated, not the full 100 chars
    expect(output).not.toContain(longTask);
  });
});

describe("formatSessionDetail", () => {
  it("formats session header", () => {
    const meta = makeMeta();
    const output = formatSessionDetail(meta, []);

    expect(output).toContain("Session: abc-123-def-456-ghi-789");
    expect(output).toContain("Agent:   claude");
    expect(output).toContain("Task:    implement feature");
    expect(output).toContain("Status:  completed");
    expect(output).toContain("Events:  42");
    expect(output).toContain("No events recorded.");
  });

  it("formats session with events", () => {
    const meta = makeMeta();
    const events = [
      makeEvent(1, "thinking"),
      makeEvent(2, "tool_call"),
      makeEvent(3, "output"),
    ];

    const output = formatSessionDetail(meta, events);

    expect(output).toContain("Session: abc-123");
    expect(output).toContain("dispatch:agent:thinking");
    expect(output).toContain("dispatch:agent:tool_call");
    expect(output).toContain("dispatch:agent:output");
    expect(output).not.toContain("No events recorded.");
  });

  it("shows error for failed sessions", () => {
    const meta = makeMeta({
      status: "failed",
      error: "agent crashed unexpectedly",
    });

    const output = formatSessionDetail(meta, []);

    expect(output).toContain("Status:  failed");
    expect(output).toContain("Error:   agent crashed unexpectedly");
  });
});
