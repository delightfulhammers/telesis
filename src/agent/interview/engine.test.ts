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

const makeChunkedMockClient = (responses: string[][]): ModelClient => {
  let callIndex = 0;
  return {
    complete: vi.fn(),
    completeStream: vi.fn(() => {
      const chunks = responses[callIndex++] ?? ["No more responses"];
      const fullText = chunks.join("");
      return (async function* () {
        for (const chunk of chunks) {
          yield { type: "text", text: chunk } as StreamEvent;
        }
        yield {
          type: "done",
          response: makeCompletionResponse(fullText),
        } as StreamEvent;
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

    // First call: seed message (API requires at least one user message)
    const firstRequest = calls[0][0] as CompletionRequest;
    expect(firstRequest.system).toBeDefined();
    expect(firstRequest.messages).toHaveLength(1);
    expect(firstRequest.messages[0].role).toBe("user");

    // Second call: has assistant + user turns from actual conversation
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

  it("concatenates multi-chunk streamed text into a single assistant turn", async () => {
    const client = makeChunkedMockClient([
      ["What ", "are you ", "building?"],
      ['Done.\n```json\n{"interview', 'Complete": true}\n```'],
    ]);
    const io = makeMockIO(["A CLI tool"]);

    const state = await runInterview(makeOptions({ client, io }));

    expect(state.turns[0].content).toBe("What are you building?");
    expect(state.complete).toBe(true);
    expect(state.turns).toHaveLength(3); // assistant + user + assistant
  });

  it("detects completion signal split across stream chunks", async () => {
    const client = makeChunkedMockClient([
      [
        "I have enough info.\n```json\n{",
        '"interviewComplete"',
        ": true}\n```",
      ],
    ]);
    const io = makeMockIO([]);

    const state = await runInterview(makeOptions({ client, io }));

    expect(state.complete).toBe(true);
    expect(io.readInput).not.toHaveBeenCalled();
  });

  it("outputs each chunk individually to the IO writer", async () => {
    const client = makeChunkedMockClient([
      ['Done.\n```json\n{"interviewComplete": true}\n```'],
    ]);
    const io = makeMockIO([]);

    await runInterview(makeOptions({ client, io }));

    // writeOutput receives the chunk text, plus separators
    const textCalls = (io.writeOutput as ReturnType<typeof vi.fn>).mock.calls
      .map((c: [string]) => c[0])
      .filter((t: string) => !t.includes("───") && !t.includes("/done"));
    expect(textCalls.some((t: string) => t.includes("Done."))).toBe(true);
  });
});
