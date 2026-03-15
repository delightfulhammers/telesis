import { describe, it, expect, vi } from "vitest";
import { extractConfig } from "./config-extract.js";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { InterviewState } from "../interview/state.js";

const makeState = (
  turns: Array<{ role: "user" | "assistant"; content: string }> = [],
): InterviewState => ({
  sessionId: "test-session",
  turns,
  complete: true,
  turnCount: turns.filter((t) => t.role === "user").length,
});

const makeResponse = (content: string): CompletionResponse => ({
  content,
  usage: { inputTokens: 100, outputTokens: 50 },
  durationMs: 500,
});

const makeClient = (response: string): ModelClient => ({
  complete: vi.fn(async () => makeResponse(response)),
  completeStream: vi.fn(),
});

describe("extractConfig", () => {
  it("extracts structured config from model response", async () => {
    const client = makeClient(
      JSON.stringify({
        name: "myproject",
        owner: "Acme Corp",
        languages: ["TypeScript"],
        repo: "github.com/acme/myproject",
      }),
    );

    const state = makeState([
      { role: "assistant", content: "What are you building?" },
      { role: "user", content: "A project management tool called myproject." },
    ]);

    const config = await extractConfig(client, state);

    expect(config.project.name).toBe("myproject");
    expect(config.project.owner).toBe("Acme Corp");
    expect(config.project.language).toBe("TypeScript");
    expect(config.project.languages).toEqual(["TypeScript"]);
    expect(config.project.repo).toBe("github.com/acme/myproject");
    expect(config.project.status).toBe("active");
  });

  it("defaults missing optional fields to empty strings", async () => {
    const client = makeClient(
      JSON.stringify({
        name: "myproject",
        owner: "",
        languages: ["Go"],
      }),
    );

    const config = await extractConfig(client, makeState());

    expect(config.project.owner).toBe("");
    expect(config.project.repo).toBe("");
    expect(config.project.languages).toEqual(["Go"]);
  });

  it("always sets status to active", async () => {
    const client = makeClient(
      JSON.stringify({
        name: "test",
        owner: "",
        languages: [],
        status: "deprecated",
      }),
    );

    const config = await extractConfig(client, makeState());

    expect(config.project.status).toBe("active");
    expect(config.project.languages).toEqual([]);
  });

  it("throws if model returns invalid JSON", async () => {
    const client = makeClient("not valid json");

    await expect(extractConfig(client, makeState())).rejects.toThrow(
      "Failed to parse config extraction response",
    );
  });

  it("throws if model response is missing name", async () => {
    const client = makeClient(
      JSON.stringify({
        owner: "Acme",
        languages: ["Go"],
      }),
    );

    await expect(extractConfig(client, makeState())).rejects.toThrow(
      "Config extraction missing required field: name",
    );
  });

  it("throws if model returns JSON null", async () => {
    const client = makeClient("null");

    await expect(extractConfig(client, makeState())).rejects.toThrow(
      "Failed to parse config extraction response",
    );
  });

  it("throws if model returns JSON array", async () => {
    const client = makeClient('[{"name": "test"}]');

    await expect(extractConfig(client, makeState())).rejects.toThrow(
      "Failed to parse config extraction response",
    );
  });

  it("includes interview context in the system prompt", async () => {
    const client = makeClient(
      JSON.stringify({ name: "test", owner: "", languages: [] }),
    );
    const state = makeState([
      { role: "assistant", content: "What are you building?" },
      { role: "user", content: "A CLI for managing tasks." },
    ]);

    await extractConfig(client, state);

    const calls = (client.complete as ReturnType<typeof vi.fn>).mock.calls;
    const request = calls[0][0] as CompletionRequest;
    expect(request.system).toContain("CLI for managing tasks");
  });

  it("extracts JSON from markdown code blocks", async () => {
    const client = makeClient(
      '```json\n{"name": "wrapped", "owner": "Test", "languages": ["Rust"]}\n```',
    );

    const config = await extractConfig(client, makeState());

    expect(config.project.name).toBe("wrapped");
    expect(config.project.languages).toEqual(["Rust"]);
  });

  it("coerces non-string fields to strings", async () => {
    const client = makeClient(
      JSON.stringify({
        name: "test",
        owner: 42,
        languages: ["TypeScript"],
        repo: null,
      }),
    );

    const config = await extractConfig(client, makeState());

    expect(config.project.owner).toBe("42");
    expect(config.project.language).toBe("TypeScript");
    expect(config.project.languages).toEqual(["TypeScript"]);
    expect(config.project.repo).toBe("");
  });

  it("rejects non-string name", async () => {
    const client = makeClient(
      JSON.stringify({ name: 42, owner: "", languages: [] }),
    );

    await expect(extractConfig(client, makeState())).rejects.toThrow(
      "Config extraction missing required field: name",
    );
  });

  it("trims whitespace from name", async () => {
    const client = makeClient(
      JSON.stringify({ name: "  myproject  ", owner: "", languages: [] }),
    );

    const config = await extractConfig(client, makeState());

    expect(config.project.name).toBe("myproject");
  });

  it("prompt instructs to extract languages not frameworks", async () => {
    const client = makeClient(
      JSON.stringify({ name: "test", owner: "", languages: ["TypeScript"] }),
    );

    await extractConfig(client, makeState());

    const calls = (client.complete as ReturnType<typeof vi.fn>).mock.calls;
    const request = calls[0][0] as CompletionRequest;
    expect(request.system).toContain("not frameworks");
  });

  it("coerces string languages response to array", async () => {
    const client = makeClient(
      JSON.stringify({
        name: "test",
        owner: "",
        languages: "Go",
      }),
    );

    const config = await extractConfig(client, makeState());

    expect(config.project.languages).toEqual(["Go"]);
    expect(config.project.language).toBe("Go");
  });
});
