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
});
