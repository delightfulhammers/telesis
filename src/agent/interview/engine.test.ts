import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInterview } from "./engine.js";
import type { InterviewIO, InterviewOptions } from "./engine.js";
import type { ModelClient } from "../model/client.js";
import type {
  CompletionRequest,
  StreamEvent,
  CompletionResponse,
} from "../model/types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("interview-engine-test");

const makeCompletionResponse = (content: string): CompletionResponse => ({
  content,
  usage: { inputTokens: 100, outputTokens: 50 },
  durationMs: 500,
});

const makeStreamEvents = (text: string): StreamEvent[] => [
  { type: "text", text },
  { type: "done", response: makeCompletionResponse(text) },
];

const makeMockClient = (responses: string[]): ModelClient => {
  let callIndex = 0;
  return {
    complete: vi.fn(),
    completeStream: vi.fn(() => {
      const text = responses[callIndex++] ?? "No more responses";
      const events = makeStreamEvents(text);
      return (async function* () {
        for (const event of events) {
          yield event;
        }
      })();
    }),
  };
};

const makeMockIO = (
  userInputs: string[],
): InterviewIO & { output: string[] } => {
  let inputIndex = 0;
  const output: string[] = [];
  return {
    readInput: vi.fn(async () => userInputs[inputIndex++] ?? "/done"),
    writeOutput: vi.fn((text: string) => output.push(text)),
    output,
  };
};

const makeOptions = (overrides: {
  client?: ModelClient;
  io?: InterviewIO;
  rootDir?: string;
  sessionId?: string;
  maxTurns?: number;
}): InterviewOptions => ({
  client: overrides.client ?? makeMockClient([]),
  io: overrides.io ?? makeMockIO([]),
  rootDir: overrides.rootDir ?? makeTempDir(),
  sessionId: overrides.sessionId ?? "test-session",
  maxTurns: overrides.maxTurns,
});

describe("runInterview", () => {
  it("conducts a multi-turn conversation and saves state", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient([
      "What are you building?",
      "What language will you use?",
      'Sounds great!\n```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO(["A CLI tool", "TypeScript"]);

    const state = await runInterview(makeOptions({ client, io, rootDir }));

    expect(state.complete).toBe(true);
    expect(state.turns).toHaveLength(5); // 3 assistant + 2 user
    expect(state.turnCount).toBe(2); // only user turns counted
    expect(state.turns[0].role).toBe("assistant");
    expect(state.turns[1].role).toBe("user");
    expect(state.turns[1].content).toBe("A CLI tool");
  });

  it("ends interview when model signals completion", async () => {
    const client = makeMockClient([
      'I have enough.\n```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO([]);

    const state = await runInterview(makeOptions({ client, io }));

    expect(state.complete).toBe(true);
    expect(state.turns).toHaveLength(1); // just the assistant completion
    expect(state.turnCount).toBe(0);
    expect(io.readInput).not.toHaveBeenCalled();
  });

  it("ends interview on /done sentinel", async () => {
    const client = makeMockClient(["What are you building?"]);
    const io = makeMockIO(["/done"]);

    const state = await runInterview(makeOptions({ client, io }));

    expect(state.complete).toBe(true);
    expect(state.turns).toHaveLength(2); // assistant + user /done
    expect(state.turns[1].content).toBe("/done");
  });

  it("handles /done case-insensitively with whitespace", async () => {
    const client = makeMockClient(["Question?"]);
    const io = makeMockIO(["  /Done  "]);

    const state = await runInterview(makeOptions({ client, io }));

    expect(state.complete).toBe(true);
  });

  it("ends interview when max turns reached without extra model call", async () => {
    const client = makeMockClient(["Q1?", "Q2?", "Q3?"]);
    const io = makeMockIO(["A1", "A2", "A3"]);

    const state = await runInterview(makeOptions({ client, io, maxTurns: 3 }));

    expect(state.complete).toBe(true);
    expect(state.turnCount).toBe(3);
    // 3 assistant + 3 user = 6 turns, no extra model call
    expect(state.turns).toHaveLength(6);
    expect(client.completeStream).toHaveBeenCalledTimes(3);
  });

  it("streams assistant text to output", async () => {
    const client = makeMockClient([
      'Done.\n```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO([]);

    await runInterview(makeOptions({ client, io }));

    const outputText = (io as ReturnType<typeof makeMockIO>).output.join("");
    expect(outputText).toContain("Done.");
  });

  it("displays intro message with /done hint", async () => {
    const client = makeMockClient([
      '```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO([]);

    await runInterview(makeOptions({ client, io }));

    const outputText = (io as ReturnType<typeof makeMockIO>).output.join("");
    expect(outputText).toContain("/done");
    expect(outputText).toContain("───");
  });

  it("persists state to interview-state.json after each user turn", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient([
      "Q1?",
      'Done.\n```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO(["A1"]);

    await runInterview(
      makeOptions({ client, io, rootDir, sessionId: "persist-test" }),
    );

    const saved = JSON.parse(
      readFileSync(join(rootDir, ".telesis", "interview-state.json"), "utf-8"),
    );
    expect(saved.sessionId).toBe("persist-test");
    expect(saved.complete).toBe(true);
    expect(saved.turns.length).toBeGreaterThan(0);
  });

  it("passes system prompt and conversation history to model", async () => {
    const client = makeMockClient([
      "Q1?",
      '```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO(["A1"]);

    await runInterview(makeOptions({ client, io }));

    const calls = (client.completeStream as ReturnType<typeof vi.fn>).mock
      .calls;

    // First call: no messages (empty conversation)
    const firstRequest = calls[0][0] as CompletionRequest;
    expect(firstRequest.system).toBeDefined();
    expect(firstRequest.messages).toHaveLength(0);

    // Second call: has assistant + user turns
    const secondRequest = calls[1][0] as CompletionRequest;
    expect(secondRequest.messages).toHaveLength(2);
    expect(secondRequest.messages[0].role).toBe("assistant");
    expect(secondRequest.messages[1].role).toBe("user");
    expect(secondRequest.messages[1].content).toBe("A1");
  });

  it("uses the same system prompt for every turn", async () => {
    const client = makeMockClient([
      "Q1?",
      "Q2?",
      '```json\n{"interviewComplete": true}\n```',
    ]);
    const io = makeMockIO(["A1", "A2"]);

    await runInterview(makeOptions({ client, io }));

    const calls = (client.completeStream as ReturnType<typeof vi.fn>).mock
      .calls;
    const prompts = calls.map((c: [CompletionRequest]) => c[0].system);
    expect(new Set(prompts).size).toBe(1);
  });
});
