import { describe, it, expect, vi } from "vitest";
import { createReviewerAnalyzer } from "./reviewer.js";
import { createEvent } from "../daemon/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse } from "../agent/model/types.js";
import type { PolicyFile } from "./types.js";
import type { DispatchContext } from "../dispatch/context.js";

const makePolicy = (): PolicyFile => ({
  name: "reviewer",
  version: 1,
  enabled: true,
  autonomy: "alert",
  trigger: "periodic",
  intervalEvents: 5,
  model: "claude-sonnet-4-6",
  systemPrompt: "Review for quality.",
});

const makeContext = (): DispatchContext => ({
  projectName: "TestProject",
  primaryLanguage: "TypeScript",
  vision: "",
  architecture: "",
  conventions: "",
  activeMilestone: "",
  activeAdrs: "",
  notes: "",
  claudeMd: "",
});

const makeClient = (content: string): ModelClient => ({
  complete: vi.fn().mockResolvedValue({
    content,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 500,
  } as CompletionResponse),
  completeStream: vi.fn(),
});

const makeEvents = (): readonly TelesisDaemonEvent[] => [
  createEvent("dispatch:agent:tool_call", {
    sessionId: "s1",
    agent: "claude",
    seq: 1,
    data: { tool: "edit_file" },
  }),
  createEvent("dispatch:agent:output", {
    sessionId: "s1",
    agent: "claude",
    seq: 2,
    data: { text: "Done" },
  }),
];

describe("createReviewerAnalyzer", () => {
  it("extracts findings from model response", async () => {
    const client = makeClient(
      JSON.stringify([
        {
          severity: "warning",
          summary: "Missing error handling in catch block",
          detail: "The catch block is empty.",
        },
      ]),
    );

    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze(makeEvents(), makeContext());

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.summary).toBe(
      "Missing error handling in catch block",
    );
    expect(result.findings[0]!.observer).toBe("reviewer");
    expect(result.findings[0]!.sessionId).toBe("session-1");
  });

  it("sends event digest to model", async () => {
    const client = makeClient("[]");
    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");

    await analyze(makeEvents(), makeContext());

    expect(client.complete).toHaveBeenCalledTimes(1);
    const call = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(call.messages[0].content).toContain("edit_file");
  });

  it("uses policy model in completion request", async () => {
    const client = makeClient("[]");
    const policy = makePolicy();
    const analyze = createReviewerAnalyzer(client, policy, "session-1");

    await analyze(makeEvents(), makeContext());

    const call = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
  });

  it("returns empty findings for empty events", async () => {
    const client = makeClient("[]");
    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze([], makeContext());

    expect(result.findings).toEqual([]);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("handles malformed model response gracefully", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = makeClient("This is not JSON at all");
    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");

    const result = await analyze(makeEvents(), makeContext());

    expect(result.findings).toEqual([]);
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it("handles response wrapped in code fences", async () => {
    const client = makeClient(
      '```json\n[{"severity":"warning","summary":"Test issue","detail":"desc"}]\n```',
    );
    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");

    const result = await analyze(makeEvents(), makeContext());
    expect(result.findings).toHaveLength(1);
  });

  it("defaults invalid severity to info", async () => {
    const client = makeClient(
      JSON.stringify([{ severity: "bogus", summary: "Test", detail: "" }]),
    );
    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze(makeEvents(), makeContext());

    expect(result.findings[0]!.severity).toBe("info");
  });

  it("skips invalid findings in array", async () => {
    const client = makeClient(
      JSON.stringify([
        { severity: "warning", summary: "Valid" },
        { not: "a finding" },
        42,
        null,
      ]),
    );
    const analyze = createReviewerAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze(makeEvents(), makeContext());

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.summary).toBe("Valid");
  });
});
