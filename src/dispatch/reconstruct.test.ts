import { describe, it, expect } from "vitest";
import { reconstructSessionText } from "./reconstruct.js";
import type { AgentEvent } from "./types.js";

/** Helper to build a minimal AgentEvent with the given overrides */
const makeEvent = (overrides: Record<string, unknown>): AgentEvent => ({
  eventVersion: 1,
  sessionId: "test-session",
  requestId: "r1",
  seq: 1,
  stream: "main",
  type: "output",
  ...overrides,
});

describe("reconstructSessionText", () => {
  it("returns empty string for an empty event array", () => {
    expect(reconstructSessionText([])).toBe("");
  });

  it("concatenates text from consecutive output events", () => {
    const events = [
      makeEvent({ seq: 1, type: "output", text: "Hello" }),
      makeEvent({ seq: 2, type: "output", text: " world" }),
      makeEvent({ seq: 3, type: "output", text: "!" }),
    ];
    expect(reconstructSessionText(events)).toBe("Hello world!");
  });

  it("renders tool call events with an inline marker", () => {
    const events = [
      makeEvent({ seq: 1, type: "tool_call", tool: "edit_file" }),
    ];
    expect(reconstructSessionText(events)).toBe("\n[tool: edit_file]\n");
  });

  it("renders tool call result text when present", () => {
    const events = [
      makeEvent({
        seq: 1,
        type: "tool_call",
        tool: "read_file",
        result: "file contents here",
      }),
    ];
    expect(reconstructSessionText(events)).toBe(
      "\n[tool: read_file]\nfile contents here",
    );
  });

  it("renders thinking events as a marker", () => {
    const events = [makeEvent({ seq: 1, type: "thinking" })];
    expect(reconstructSessionText(events)).toBe("\n[thinking...]\n");
  });

  it("handles a mixed sequence of output, tool_call, and thinking events", () => {
    const events = [
      makeEvent({ seq: 1, type: "output", text: "Let me check " }),
      makeEvent({ seq: 2, type: "output", text: "the file." }),
      makeEvent({ seq: 3, type: "thinking" }),
      makeEvent({ seq: 4, type: "tool_call", tool: "read_file" }),
      makeEvent({ seq: 5, type: "output", text: "Here are the results." }),
    ];
    expect(reconstructSessionText(events)).toBe(
      "Let me check the file.\n[thinking...]\n\n[tool: read_file]\nHere are the results.",
    );
  });

  it("skips output events with missing text field", () => {
    const events = [
      makeEvent({ seq: 1, type: "output" }), // no text field
      makeEvent({ seq: 2, type: "output", text: "visible" }),
    ];
    expect(reconstructSessionText(events)).toBe("visible");
  });

  it("skips output events with non-string text field", () => {
    const events = [
      makeEvent({ seq: 1, type: "output", text: 42 }),
      makeEvent({ seq: 2, type: "output", text: null }),
      makeEvent({ seq: 3, type: "output", text: "ok" }),
    ];
    expect(reconstructSessionText(events)).toBe("ok");
  });

  it("uses 'unknown' for tool_call events with missing tool name", () => {
    const events = [makeEvent({ seq: 1, type: "tool_call" })];
    expect(reconstructSessionText(events)).toBe("\n[tool: unknown]\n");
  });

  it("skips unrecognized event types", () => {
    const events = [
      makeEvent({ seq: 1, type: "output", text: "start" }),
      makeEvent({ seq: 2, type: "diffs" }),
      makeEvent({ seq: 3, type: "cancelled" }),
      makeEvent({ seq: 4, type: "output", text: " end" }),
    ];
    expect(reconstructSessionText(events)).toBe("start end");
  });

  it("skips output events with empty text", () => {
    const events = [
      makeEvent({ seq: 1, type: "output", text: "" }),
      makeEvent({ seq: 2, type: "output", text: "content" }),
      makeEvent({ seq: 3, type: "output", text: "" }),
    ];
    expect(reconstructSessionText(events)).toBe("content");
  });
});
