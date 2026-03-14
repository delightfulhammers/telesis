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

  it("formats oversight:finding with observer, severity, summary", () => {
    const event = createEvent("oversight:finding", {
      sessionId: "abc-123",
      observer: "reviewer",
      severity: "warning",
      summary: "Missing error handling in catch block",
    });

    const line = formatEventLine(event);
    expect(line).toContain("oversight:finding");
    expect(line).toContain("observer=reviewer");
    expect(line).toContain("severity=warning");
    expect(line).toContain("Missing error handling");
  });

  it("formats oversight:note with tags and text", () => {
    const event = createEvent("oversight:note", {
      sessionId: "abc-123",
      text: "Pattern: agent prefers functional style",
      tags: ["agent:chronicler"],
    });

    const line = formatEventLine(event);
    expect(line).toContain("oversight:note");
    expect(line).toContain("tags=agent:chronicler");
    expect(line).toContain("Pattern: agent prefers");
  });

  it("formats oversight:intervention with observer and reason", () => {
    const event = createEvent("oversight:intervention", {
      sessionId: "abc-123",
      observer: "architect",
      reason: "Spec drift detected in auth module",
    });

    const line = formatEventLine(event);
    expect(line).toContain("oversight:intervention");
    expect(line).toContain("observer=architect");
    expect(line).toContain("Spec drift detected");
  });

  it("applies red color for oversight:finding events", () => {
    const event = createEvent("oversight:finding", {
      sessionId: "abc",
      observer: "reviewer",
      severity: "warning",
      summary: "test",
    });

    // Red ANSI code
    expect(formatEventLine(event)).toContain("\x1b[31m");
  });

  it("applies bold red color for oversight:intervention events", () => {
    const event = createEvent("oversight:intervention", {
      sessionId: "abc",
      observer: "architect",
      reason: "drift",
    });

    // Bold red ANSI code
    expect(formatEventLine(event)).toContain("\x1b[1;31m");
  });

  it("applies green color for oversight:note events", () => {
    const event = createEvent("oversight:note", {
      sessionId: "abc",
      text: "note text",
      tags: ["agent:chronicler"],
    });

    // Green ANSI code
    expect(formatEventLine(event)).toContain("\x1b[32m");
  });

  it("formats intake:item:imported with source and title", () => {
    const event = createEvent("intake:item:imported", {
      itemId: "uuid-1",
      source: "github",
      sourceId: "42",
      title: "Fix login bug",
    });

    const line = formatEventLine(event);
    expect(line).toContain("intake:item:imported");
    expect(line).toContain("github#42");
    expect(line).toContain("Fix login bug");
  });

  it("formats intake:sync:completed with counts", () => {
    const event = createEvent("intake:sync:completed", {
      source: "github",
      imported: 5,
      skippedDuplicate: 3,
    });

    const line = formatEventLine(event);
    expect(line).toContain("intake:sync:completed");
    expect(line).toContain("source=github");
    expect(line).toContain("imported=5");
    expect(line).toContain("skipped=3");
  });

  it("formats intake:sync:started with source", () => {
    const event = createEvent("intake:sync:started", {
      source: "github",
      imported: 0,
      skippedDuplicate: 0,
    });

    const line = formatEventLine(event);
    expect(line).toContain("intake:sync:started");
    expect(line).toContain("source=github");
  });

  it("applies cyan color for intake events", () => {
    const event = createEvent("intake:item:imported", {
      itemId: "uuid-1",
      source: "github",
      sourceId: "42",
      title: "Test",
    });

    // Cyan ANSI code
    expect(formatEventLine(event)).toContain("\x1b[36m");
  });

  it("formats intake:item:approved with source and title", () => {
    const event = createEvent("intake:item:approved", {
      itemId: "uuid-1",
      source: "github",
      sourceId: "42",
      title: "Add feature",
    });

    const line = formatEventLine(event);
    expect(line).toContain("intake:item:approved");
    expect(line).toContain("github#42");
    expect(line).toContain("Add feature");
  });

  it("formats pipeline:review_passed with findings and threshold", () => {
    const event = createEvent("pipeline:review_passed", {
      workItemId: "abcdef01-2345-6789-abcd-ef0123456789",
      findingCount: 3,
      blockingCount: 0,
      threshold: "high",
    });

    const line = formatEventLine(event);
    expect(line).toContain("pipeline:review_passed");
    expect(line).toContain("work-item=abcdef01");
    expect(line).toContain("findings=3");
    expect(line).toContain("blocking=0");
    expect(line).toContain("threshold=high");
  });

  it("formats pipeline:review_failed with findings and threshold", () => {
    const event = createEvent("pipeline:review_failed", {
      workItemId: "abcdef01-2345-6789-abcd-ef0123456789",
      findingCount: 5,
      blockingCount: 2,
      threshold: "medium",
    });

    const line = formatEventLine(event);
    expect(line).toContain("pipeline:review_failed");
    expect(line).toContain("work-item=abcdef01");
    expect(line).toContain("findings=5");
    expect(line).toContain("blocking=2");
    expect(line).toContain("threshold=medium");
  });

  it("applies green color for pipeline:review_passed events", () => {
    const event = createEvent("pipeline:review_passed", {
      workItemId: "abc",
      findingCount: 0,
      blockingCount: 0,
      threshold: "high",
    });

    // Green ANSI code (pipeline:* → green)
    expect(formatEventLine(event)).toContain("\x1b[32m");
  });

  it("applies red color for pipeline:review_failed events", () => {
    const event = createEvent("pipeline:review_failed", {
      workItemId: "abc",
      findingCount: 1,
      blockingCount: 1,
      threshold: "high",
    });

    // Red ANSI code (failure events → red)
    expect(formatEventLine(event)).toContain("\x1b[31m");
  });

  it("formats pipeline:quality_gate_passed with gate name and duration", () => {
    const event = createEvent("pipeline:quality_gate_passed", {
      workItemId: "abcdef01-2345-6789-abcd-ef0123456789",
      gate: "lint",
      durationMs: 3000,
    });

    const line = formatEventLine(event);
    expect(line).toContain("pipeline:quality_gate_passed");
    expect(line).toContain("work-item=abcdef01");
    expect(line).toContain("gate=lint");
    expect(line).toContain("3s");
  });

  it("formats pipeline:quality_gate_passed with amended flag", () => {
    const event = createEvent("pipeline:quality_gate_passed", {
      workItemId: "abcdef01-2345-6789-abcd-ef0123456789",
      gate: "format",
      durationMs: 2000,
      amended: true,
    });

    const line = formatEventLine(event);
    expect(line).toContain("(amended)");
  });

  it("formats pipeline:quality_gate_failed with error", () => {
    const event = createEvent("pipeline:quality_gate_failed", {
      workItemId: "abcdef01-2345-6789-abcd-ef0123456789",
      gate: "test",
      durationMs: 5000,
      error: "3 tests failed",
    });

    const line = formatEventLine(event);
    expect(line).toContain("pipeline:quality_gate_failed");
    expect(line).toContain("gate=test");
    expect(line).toContain("3 tests failed");
  });

  it("applies green color for pipeline:quality_gate_passed", () => {
    const event = createEvent("pipeline:quality_gate_passed", {
      workItemId: "abc",
      gate: "lint",
      durationMs: 1000,
    });

    expect(formatEventLine(event)).toContain("\x1b[32m");
  });

  it("applies red color for pipeline:quality_gate_failed", () => {
    const event = createEvent("pipeline:quality_gate_failed", {
      workItemId: "abc",
      gate: "build",
      durationMs: 1000,
      error: "build failed",
    });

    expect(formatEventLine(event)).toContain("\x1b[31m");
  });

  it("formats intake:item:skipped", () => {
    const event = createEvent("intake:item:skipped", {
      itemId: "uuid-1",
      source: "github",
      sourceId: "99",
      title: "Won't fix this",
    });

    const line = formatEventLine(event);
    expect(line).toContain("intake:item:skipped");
    expect(line).toContain("github#99");
  });
});
