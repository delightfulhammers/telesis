import { describe, it, expect } from "vitest";
import { formatEventLine } from "./tui.js";
import { createEvent } from "./types.js";

describe("formatEventLine", () => {
  it("formats filesystem events with path", () => {
    const event = createEvent("fs:file:modified", {
      path: "src/daemon/bus.ts",
      absolutePath: "/dev/project/src/daemon/bus.ts",
    });

    const line = formatEventLine(event);
    expect(line).toContain("fs:file:modified");
    expect(line).toContain("src/daemon/bus.ts");
  });

  it("formats daemon:started with pid and version", () => {
    const event = createEvent("daemon:started", {
      pid: 12345,
      rootDir: "/dev/project",
      version: "0.12.0",
    });

    const line = formatEventLine(event);
    expect(line).toContain("daemon:started");
    expect(line).toContain("pid=12345");
    expect(line).toContain("v0.12.0");
  });

  it("formats daemon:heartbeat with uptime and event count", () => {
    const event = createEvent("daemon:heartbeat", {
      uptimeMs: 45000,
      eventCount: 127,
    });

    const line = formatEventLine(event);
    expect(line).toContain("daemon:heartbeat");
    expect(line).toContain("uptime=45s");
    expect(line).toContain("events=127");
  });

  it("formats daemon:stopping without payload", () => {
    const event = createEvent("daemon:stopping", {});

    const line = formatEventLine(event);
    expect(line).toContain("daemon:stopping");
  });

  it("formats socket events with truncated client ID", () => {
    const event = createEvent("socket:client:connected", {
      clientId: "abcdef01-2345-6789-abcd-ef0123456789",
    });

    const line = formatEventLine(event);
    expect(line).toContain("socket:client:connected");
    expect(line).toContain("abcdef01");
  });

  it("includes timestamp in HH:MM:SS.mmm format", () => {
    const event = createEvent("daemon:heartbeat", {
      uptimeMs: 1000,
      eventCount: 1,
    });

    const line = formatEventLine(event);
    // Should contain a time pattern like 12:34:56.789
    expect(line).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it("applies ANSI colors", () => {
    const fsEvent = createEvent("fs:file:created", {
      path: "test.ts",
      absolutePath: "/test.ts",
    });
    const daemonEvent = createEvent("daemon:heartbeat", {
      uptimeMs: 0,
      eventCount: 0,
    });

    // Cyan for fs events
    expect(formatEventLine(fsEvent)).toContain("\x1b[36m");
    // Green for daemon events
    expect(formatEventLine(daemonEvent)).toContain("\x1b[32m");
  });

  it("formats dispatch:session:started with agent and task", () => {
    const event = createEvent("dispatch:session:started", {
      sessionId: "abc-123",
      agent: "claude",
      task: "implement login",
    });

    const line = formatEventLine(event);
    expect(line).toContain("dispatch:session:started");
    expect(line).toContain("agent=claude");
    expect(line).toContain('task="implement login"');
  });

  it("formats dispatch:session:completed with duration and events", () => {
    const event = createEvent("dispatch:session:completed", {
      sessionId: "abc-123",
      agent: "claude",
      task: "implement login",
      durationMs: 16000,
      eventCount: 42,
    });

    const line = formatEventLine(event);
    expect(line).toContain("dispatch:session:completed");
    expect(line).toContain("duration=16s");
    expect(line).toContain("events=42");
  });

  it("formats dispatch:session:failed with error", () => {
    const event = createEvent("dispatch:session:failed", {
      sessionId: "abc-123",
      agent: "claude",
      task: "implement login",
      error: "agent crashed",
    });

    const line = formatEventLine(event);
    expect(line).toContain("dispatch:session:failed");
    expect(line).toContain('error="agent crashed"');
  });

  it("formats dispatch:agent:tool_call with seq and tool name", () => {
    const event = createEvent("dispatch:agent:tool_call", {
      sessionId: "abc-123",
      agent: "claude",
      seq: 3,
      data: { tool: "edit_file" },
    });

    const line = formatEventLine(event);
    expect(line).toContain("dispatch:agent:tool_call");
    expect(line).toContain("seq=3");
    expect(line).toContain("tool=edit_file");
  });

  it("applies magenta color for dispatch:session:* events", () => {
    const event = createEvent("dispatch:session:started", {
      sessionId: "abc",
      agent: "claude",
      task: "test",
    });

    // Magenta ANSI code
    expect(formatEventLine(event)).toContain("\x1b[35m");
  });

  it("applies yellow color for dispatch:agent:* events", () => {
    const event = createEvent("dispatch:agent:thinking", {
      sessionId: "abc",
      agent: "claude",
      seq: 1,
      data: {},
    });

    // Yellow ANSI code
    expect(formatEventLine(event)).toContain("\x1b[33m");
  });
});
