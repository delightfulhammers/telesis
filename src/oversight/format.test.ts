import { describe, it, expect } from "vitest";
import { formatEventDigest } from "./format.js";
import { createEvent } from "../daemon/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";

const makeToolCallEvent = (seq: number, tool: string): TelesisDaemonEvent =>
  createEvent("dispatch:agent:tool_call", {
    sessionId: "s1",
    agent: "claude",
    seq,
    data: { tool },
  });

const makeOutputEvent = (seq: number, text: string): TelesisDaemonEvent =>
  createEvent("dispatch:agent:output", {
    sessionId: "s1",
    agent: "claude",
    seq,
    data: { text },
  });

describe("formatEventDigest", () => {
  it("returns placeholder for empty events", () => {
    expect(formatEventDigest([])).toBe("(no events)");
  });

  it("formats tool call events with tool name", () => {
    const events = [makeToolCallEvent(1, "edit_file")];
    const digest = formatEventDigest(events);
    expect(digest).toContain("tool=edit_file");
    expect(digest).toContain("seq=1");
  });

  it("formats output events with text snippet", () => {
    const events = [makeOutputEvent(2, "Hello world")];
    const digest = formatEventDigest(events);
    expect(digest).toContain('"Hello world"');
  });

  it("includes event count in header", () => {
    const events = [
      makeToolCallEvent(1, "read_file"),
      makeToolCallEvent(2, "edit_file"),
    ];
    const digest = formatEventDigest(events);
    expect(digest).toContain("2 events");
  });

  it("preserves event order in digest", () => {
    const events = [
      makeToolCallEvent(1, "first"),
      makeToolCallEvent(2, "second"),
    ];
    const digest = formatEventDigest(events);
    const firstIdx = digest.indexOf("first");
    const secondIdx = digest.indexOf("second");
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it("truncates long output text", () => {
    const longText = "x".repeat(500);
    const events = [makeOutputEvent(1, longText)];
    const digest = formatEventDigest(events);
    // Should be truncated, not full 500 chars
    expect(digest.length).toBeLessThan(600);
    expect(digest).toContain("…");
  });

  it("caps total digest at ~8k chars, prioritizing recent events", () => {
    // Create many events that would exceed 8k
    const events: TelesisDaemonEvent[] = [];
    for (let i = 0; i < 200; i++) {
      events.push(makeOutputEvent(i, "A".repeat(100)));
    }
    const digest = formatEventDigest(events);
    expect(digest.length).toBeLessThanOrEqual(9000); // header + 8k body
    expect(digest).toContain("omitted");
  });

  it("formats session started events", () => {
    const events: TelesisDaemonEvent[] = [
      createEvent("dispatch:session:started", {
        sessionId: "s1",
        agent: "claude",
        task: "fix the bug",
      }),
    ];
    const digest = formatEventDigest(events);
    expect(digest).toContain("session:started");
    expect(digest).toContain("agent=claude");
  });

  it("formats thinking events", () => {
    const events: TelesisDaemonEvent[] = [
      createEvent("dispatch:agent:thinking", {
        sessionId: "s1",
        agent: "claude",
        seq: 1,
        data: {},
      }),
    ];
    const digest = formatEventDigest(events);
    expect(digest).toContain("[thinking]");
  });
});
