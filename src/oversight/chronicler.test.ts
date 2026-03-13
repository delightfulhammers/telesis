import { describe, it, expect, vi } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createChroniclerAnalyzer } from "./chronicler.js";
import { createEvent } from "../daemon/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse } from "../agent/model/types.js";
import type { PolicyFile } from "./types.js";
import type { DispatchContext } from "../dispatch/context.js";
import { useTempDir } from "../test-utils.js";
import { loadNotes } from "../notes/store.js";

const makeTempDir = useTempDir("oversight-chronicler");

const makePolicy = (): PolicyFile => ({
  name: "chronicler",
  version: 1,
  enabled: true,
  autonomy: "observe",
  trigger: "on-complete",
  intervalEvents: 10,
  model: "claude-sonnet-4-6",
  systemPrompt: "Extract insights.",
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
    data: { text: "Implemented login feature" },
  }),
];

describe("createChroniclerAnalyzer", () => {
  it("extracts notes from model response and writes them", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const client = makeClient(
      JSON.stringify([
        {
          text: "Agent chose functional style for auth module",
          tags: ["pattern", "architecture"],
        },
      ]),
    );

    const analyze = createChroniclerAnalyzer(
      client,
      makePolicy(),
      "abcd1234-5678-90ab-cdef-1234567890ab",
      dir,
    );
    const result = await analyze(makeEvents(), makeContext());

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]!.text).toBe(
      "Agent chose functional style for auth module",
    );
    expect(result.notes[0]!.tags).toContain("agent:chronicler");
    expect(result.notes[0]!.tags).toContain("session:abcd1234");

    // Verify note was written to store
    const stored = loadNotes(dir);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]!.text).toBe(
      "Agent chose functional style for auth module",
    );
  });

  it("adds agent:chronicler and session tags to every note", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const client = makeClient(
      JSON.stringify([{ text: "Insight", tags: ["custom"] }]),
    );

    const analyze = createChroniclerAnalyzer(
      client,
      makePolicy(),
      "abcd1234-0000-0000-0000-000000000000",
      dir,
    );
    const result = await analyze(makeEvents(), makeContext());

    expect(result.notes[0]!.tags).toContain("agent:chronicler");
    expect(result.notes[0]!.tags).toContain("session:abcd1234");
    expect(result.notes[0]!.tags).toContain("custom");
  });

  it("returns empty notes for empty events", async () => {
    const dir = makeTempDir();
    const client = makeClient("[]");

    const analyze = createChroniclerAnalyzer(
      client,
      makePolicy(),
      "session-1",
      dir,
    );
    const result = await analyze([], makeContext());

    expect(result.notes).toEqual([]);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("handles malformed model response gracefully", async () => {
    const dir = makeTempDir();
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = makeClient("not json");

    const analyze = createChroniclerAnalyzer(
      client,
      makePolicy(),
      "session-1",
      dir,
    );
    const result = await analyze(makeEvents(), makeContext());

    expect(result.notes).toEqual([]);
    stderrSpy.mockRestore();
  });

  it("extracts multiple notes", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const client = makeClient(
      JSON.stringify([
        { text: "First insight", tags: ["pattern"] },
        { text: "Second insight", tags: ["gotcha"] },
      ]),
    );

    const analyze = createChroniclerAnalyzer(
      client,
      makePolicy(),
      "session-1",
      dir,
    );
    const result = await analyze(makeEvents(), makeContext());

    expect(result.notes).toHaveLength(2);
    const stored = loadNotes(dir);
    expect(stored.items).toHaveLength(2);
  });

  it("skips invalid notes in array", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const client = makeClient(
      JSON.stringify([
        { text: "Valid note", tags: [] },
        { not: "a note" },
        { text: "", tags: [] }, // empty text is invalid
      ]),
    );

    const analyze = createChroniclerAnalyzer(
      client,
      makePolicy(),
      "session-1",
      dir,
    );
    const result = await analyze(makeEvents(), makeContext());

    expect(result.notes).toHaveLength(1);
  });
});
