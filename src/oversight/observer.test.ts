import { describe, it, expect, vi } from "vitest";
import { createObserver } from "./observer.js";
import { createEvent } from "../daemon/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { AnalyzeFn, ObserverOutput, PolicyFile } from "./types.js";
import type { DispatchContext } from "../dispatch/context.js";

const makePolicy = (overrides: Partial<PolicyFile> = {}): PolicyFile => ({
  name: "test-observer",
  version: 1,
  enabled: true,
  autonomy: "alert",
  trigger: "periodic",
  intervalEvents: 3,
  model: "claude-sonnet-4-6",
  systemPrompt: "Test prompt.",
  ...overrides,
});

const makeContext = (): DispatchContext => ({
  projectName: "test",
  primaryLanguage: "TypeScript",
  vision: "",
  architecture: "",
  conventions: "",
  activeMilestone: "",
  activeAdrs: "",
  notes: "",
  claudeMd: "",
});

const makeToolCallEvent = (seq: number): TelesisDaemonEvent =>
  createEvent("dispatch:agent:tool_call", {
    sessionId: "s1",
    agent: "claude",
    seq,
    data: { tool: "edit_file" },
  });

const makeOutputEvent = (seq: number): TelesisDaemonEvent =>
  createEvent("dispatch:agent:output", {
    sessionId: "s1",
    agent: "claude",
    seq,
    data: { text: "output" },
  });

const emptyOutput: ObserverOutput = { findings: [], notes: [] };

describe("createObserver", () => {
  it("periodic trigger fires analysis at interval", async () => {
    const analyzeFn = vi.fn<AnalyzeFn>().mockResolvedValue(emptyOutput);
    const observer = createObserver({
      policy: makePolicy({ trigger: "periodic", intervalEvents: 3 }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1));
    observer.receive(makeToolCallEvent(2));
    expect(analyzeFn).not.toHaveBeenCalled();

    observer.receive(makeToolCallEvent(3));
    // Should have scheduled analysis at event 3
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    // Snapshot should contain all 3 events
    expect(analyzeFn.mock.calls[0]![0]).toHaveLength(3);
  });

  it("receive() returns synchronously", () => {
    const analyzeFn = vi.fn<AnalyzeFn>().mockResolvedValue(emptyOutput);
    const observer = createObserver({
      policy: makePolicy({ trigger: "periodic", intervalEvents: 1 }),
      analyzeFn,
      context: makeContext(),
    });

    // receive should not throw or return a promise
    const result = observer.receive(makeToolCallEvent(1));
    expect(result).toBeUndefined();
  });

  it("drain waits for all pending analyses", async () => {
    let callCount = 0;
    const analyzeFn = vi.fn<AnalyzeFn>().mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return emptyOutput;
    });

    const observer = createObserver({
      policy: makePolicy({ trigger: "periodic", intervalEvents: 2 }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1));
    observer.receive(makeToolCallEvent(2)); // triggers periodic analysis
    observer.receive(makeToolCallEvent(3)); // 1 unanalyzed event

    const result = await observer.drain();
    // Periodic analysis + drain's final analysis for the tail event
    expect(callCount).toBe(2);
    expect(result.findings).toEqual([]);
  });

  it("drain skips final analysis when no unanalyzed events", async () => {
    const analyzeFn = vi.fn<AnalyzeFn>().mockResolvedValue(emptyOutput);

    const observer = createObserver({
      policy: makePolicy({ trigger: "periodic", intervalEvents: 1 }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1)); // triggers analysis at 1
    await observer.drain();

    // Only the periodic trigger, no duplicate from drain
    expect(analyzeFn).toHaveBeenCalledTimes(1);
  });

  it("empty buffer produces empty output on drain", async () => {
    const analyzeFn = vi.fn<AnalyzeFn>().mockResolvedValue(emptyOutput);
    const observer = createObserver({
      policy: makePolicy(),
      analyzeFn,
      context: makeContext(),
    });

    const result = await observer.drain();
    expect(result.findings).toEqual([]);
    expect(result.notes).toEqual([]);
    // No analysis should be scheduled for empty buffer
    expect(analyzeFn).not.toHaveBeenCalled();
  });

  it("on-complete trigger only fires in drain", async () => {
    const analyzeFn = vi.fn<AnalyzeFn>().mockResolvedValue(emptyOutput);
    const observer = createObserver({
      policy: makePolicy({ trigger: "on-complete" }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1));
    observer.receive(makeToolCallEvent(2));
    observer.receive(makeOutputEvent(3));

    // No analysis should have been scheduled
    expect(analyzeFn).not.toHaveBeenCalled();

    await observer.drain();
    // Now analysis should have run once (the drain's final analysis)
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    expect(analyzeFn.mock.calls[0]![0]).toHaveLength(3);
  });

  it("on-output trigger fires on dispatch:agent:output events", async () => {
    const analyzeFn = vi.fn<AnalyzeFn>().mockResolvedValue(emptyOutput);
    const observer = createObserver({
      policy: makePolicy({ trigger: "on-output" }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1));
    expect(analyzeFn).not.toHaveBeenCalled();

    observer.receive(makeOutputEvent(2));
    expect(analyzeFn).toHaveBeenCalledTimes(1);
  });

  it("aggregates findings from multiple analysis passes", async () => {
    let callCount = 0;
    const analyzeFn = vi.fn<AnalyzeFn>().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          findings: [
            {
              id: "f1",
              observer: "test",
              sessionId: "s1",
              severity: "warning" as const,
              summary: "First finding",
              detail: "",
              eventRange: { from: 0, to: 1 },
            },
          ],
          notes: [],
        };
      }
      return emptyOutput;
    });

    const observer = createObserver({
      policy: makePolicy({ trigger: "periodic", intervalEvents: 2 }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1));
    observer.receive(makeToolCallEvent(2)); // triggers first analysis
    observer.receive(makeToolCallEvent(3));

    const result = await observer.drain();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.summary).toBe("First finding");
  });

  it("handles analysis failure gracefully", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const analyzeFn = vi
      .fn<AnalyzeFn>()
      .mockRejectedValue(new Error("API timeout"));

    const observer = createObserver({
      policy: makePolicy({ trigger: "periodic", intervalEvents: 1 }),
      analyzeFn,
      context: makeContext(),
    });

    observer.receive(makeToolCallEvent(1));
    const result = await observer.drain();

    expect(result.findings).toEqual([]);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("analysis failed"),
    );
    stderrSpy.mockRestore();
  });
});
