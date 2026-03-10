import { describe, it, expect, vi } from "vitest";
import {
  extractTopics,
  parseTopicsResponse,
  formatTopicsSummary,
} from "./topics.js";
import type { InterviewTopics } from "./topics.js";
import type { InterviewState } from "../interview/state.js";
import type { ModelClient } from "../model/client.js";

const makeState = (userMessages: readonly string[]): InterviewState => ({
  sessionId: "test",
  turns: userMessages.flatMap((msg, i) => [
    { role: "assistant" as const, content: `Question ${i + 1}?` },
    { role: "user" as const, content: msg },
  ]),
  complete: true,
  turnCount: userMessages.length,
});

const mockClient = (responseContent: string): ModelClient =>
  ({
    complete: vi.fn().mockResolvedValue({ content: responseContent }),
  }) as unknown as ModelClient;

describe("parseTopicsResponse", () => {
  it("parses valid JSON response", () => {
    const response = JSON.stringify({
      features: ["task management", "recurring tasks"],
      preferences: ["functional programming"],
      technologies: ["TypeScript", "PostgreSQL"],
      outOfScope: ["mobile app"],
      successCriteria: ["5-minute onboarding"],
      architectureHints: ["monorepo layout"],
    });

    const result = parseTopicsResponse(response);

    expect(result.features).toEqual(["task management", "recurring tasks"]);
    expect(result.preferences).toEqual(["functional programming"]);
    expect(result.technologies).toEqual(["TypeScript", "PostgreSQL"]);
    expect(result.outOfScope).toEqual(["mobile app"]);
    expect(result.successCriteria).toEqual(["5-minute onboarding"]);
    expect(result.architectureHints).toEqual(["monorepo layout"]);
  });

  it("extracts JSON from surrounding text", () => {
    const response = `Here are the topics:\n\n${JSON.stringify({
      features: ["chat feature"],
      preferences: [],
      technologies: ["React"],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    })}\n\nDone.`;

    const result = parseTopicsResponse(response);
    expect(result.features).toEqual(["chat feature"]);
    expect(result.technologies).toEqual(["React"]);
  });

  it("returns empty arrays for missing fields", () => {
    const response = JSON.stringify({ features: ["something"] });
    const result = parseTopicsResponse(response);

    expect(result.features).toEqual(["something"]);
    expect(result.preferences).toEqual([]);
    expect(result.technologies).toEqual([]);
    expect(result.outOfScope).toEqual([]);
    expect(result.successCriteria).toEqual([]);
    expect(result.architectureHints).toEqual([]);
  });

  it("returns empty arrays for non-JSON response", () => {
    const result = parseTopicsResponse("No JSON here");

    expect(result.features).toEqual([]);
    expect(result.preferences).toEqual([]);
  });

  it("filters non-string values from arrays", () => {
    const response = JSON.stringify({
      features: ["valid", 42, null, "also valid"],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    });

    const result = parseTopicsResponse(response);
    expect(result.features).toEqual(["valid", "also valid"]);
  });
});

describe("formatTopicsSummary", () => {
  it("formats all topic categories", () => {
    const topics: InterviewTopics = {
      features: ["task management", "notifications"],
      preferences: ["functional programming"],
      technologies: ["TypeScript"],
      outOfScope: ["mobile app"],
      successCriteria: ["5-minute onboarding"],
      architectureHints: ["monorepo"],
    };

    const result = formatTopicsSummary(topics);

    expect(result).toContain("Topics from interview");
    expect(result).toContain("ensure ALL appear in output");
    expect(result).toContain("- task management");
    expect(result).toContain("- notifications");
    expect(result).toContain("- functional programming");
    expect(result).toContain("- TypeScript");
    expect(result).toContain("- mobile app");
    expect(result).toContain("- 5-minute onboarding");
    expect(result).toContain("- monorepo");
  });

  it("omits empty categories", () => {
    const topics: InterviewTopics = {
      features: ["chat"],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    };

    const result = formatTopicsSummary(topics);

    expect(result).toContain("- chat");
    expect(result).not.toContain("Developer preferences");
    expect(result).not.toContain("Technologies mentioned");
  });

  it("returns empty string when all categories are empty", () => {
    const topics: InterviewTopics = {
      features: [],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    };

    expect(formatTopicsSummary(topics)).toBe("");
  });
});

describe("extractTopics", () => {
  it("calls model with interview transcript and returns parsed topics", async () => {
    const state = makeState(["I want to build a CLI tool in Go"]);
    const client = mockClient(
      JSON.stringify({
        features: ["CLI tool"],
        preferences: [],
        technologies: ["Go"],
        outOfScope: [],
        successCriteria: [],
        architectureHints: [],
      }),
    );

    const result = await extractTopics(client, state);

    expect(result.features).toEqual(["CLI tool"]);
    expect(result.technologies).toEqual(["Go"]);
    expect(client.complete).toHaveBeenCalledOnce();

    const call = vi.mocked(client.complete).mock.calls[0][0];
    expect(call.system).toContain(
      "Developer: I want to build a CLI tool in Go",
    );
  });

  it("returns empty topics for empty interview", async () => {
    const state: InterviewState = {
      sessionId: "test",
      turns: [],
      complete: true,
      turnCount: 0,
    };
    const client = mockClient("{}");

    const result = await extractTopics(client, state);

    expect(result.features).toEqual([]);
    expect(client.complete).not.toHaveBeenCalled();
  });
});
