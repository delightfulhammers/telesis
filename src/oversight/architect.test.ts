import { describe, it, expect, vi } from "vitest";
import { createArchitectAnalyzer } from "./architect.js";
import { createEvent } from "../daemon/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse } from "../agent/model/types.js";
import type { PolicyFile } from "./types.js";
import type { DispatchContext } from "../dispatch/context.js";

const makePolicy = (): PolicyFile => ({
  name: "architect",
  version: 1,
  enabled: true,
  autonomy: "alert",
  trigger: "periodic",
  intervalEvents: 10,
  model: "claude-sonnet-4-6",
  systemPrompt: "Detect spec drift.",
});

const makeContext = (): DispatchContext => ({
  projectName: "TestProject",
  primaryLanguage: "TypeScript",
  vision: "",
  architecture: "## Modules\nsrc/dispatch/ — agent dispatch",
  conventions: "",
  activeMilestone: "## v0.14.0\nActive Oversight",
  activeAdrs: "### ADR-002\nTypeScript rewrite",
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
];

describe("createArchitectAnalyzer", () => {
  it("extracts findings from model response", async () => {
    const client = makeClient(
      JSON.stringify([
        {
          severity: "critical",
          summary: "Agent importing SDK directly instead of via ModelClient",
          detail: "Violates ADR-002 containment rule.",
        },
      ]),
    );

    const analyze = createArchitectAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze(makeEvents(), makeContext());

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("critical");
    expect(result.findings[0]!.observer).toBe("architect");
  });

  it("includes architecture context in prompt", async () => {
    const client = makeClient("[]");
    const analyze = createArchitectAnalyzer(client, makePolicy(), "session-1");
    await analyze(makeEvents(), makeContext());

    const call = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(call.system).toContain("src/dispatch/");
    expect(call.system).toContain("ADR-002");
  });

  it("returns empty findings for empty events", async () => {
    const client = makeClient("[]");
    const analyze = createArchitectAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze([], makeContext());

    expect(result.findings).toEqual([]);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("handles malformed model response gracefully", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = makeClient("not json");
    const analyze = createArchitectAnalyzer(client, makePolicy(), "session-1");

    const result = await analyze(makeEvents(), makeContext());
    expect(result.findings).toEqual([]);
    stderrSpy.mockRestore();
  });

  it("defaults invalid severity to info", async () => {
    const client = makeClient(
      JSON.stringify([{ severity: "high", summary: "Test" }]),
    );
    const analyze = createArchitectAnalyzer(client, makePolicy(), "session-1");
    const result = await analyze(makeEvents(), makeContext());

    expect(result.findings[0]!.severity).toBe("info");
  });
});
