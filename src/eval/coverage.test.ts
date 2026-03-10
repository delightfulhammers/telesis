import { describe, it, expect } from "vitest";
import { evaluateCoverage, extractTopics } from "./coverage.js";
import type { InterviewState } from "../agent/interview/state.js";
import type { GeneratedDocs } from "../agent/generate/types.js";

const makeState = (userMessages: readonly string[]): InterviewState => ({
  sessionId: "test",
  turns: userMessages.flatMap((msg, i) => [
    {
      role: "assistant" as const,
      content: `Question ${i + 1}?`,
    },
    { role: "user" as const, content: msg },
  ]),
  complete: true,
  turnCount: userMessages.length,
});

describe("extractTopics", () => {
  it("extracts multi-word meaningful phrases from user messages", () => {
    const state = makeState([
      "I'm building a task management CLI in TypeScript",
      "It should support recurring tasks and deadline reminders",
    ]);

    const topics = extractTopics(state);

    expect(topics.length).toBeGreaterThan(0);
    expect(topics.some((t) => /task management/i.test(t))).toBe(true);
    expect(topics.some((t) => /typescript/i.test(t))).toBe(true);
    expect(topics.some((t) => /recurring tasks/i.test(t))).toBe(true);
    expect(topics.some((t) => /deadline reminders/i.test(t))).toBe(true);
  });

  it("ignores assistant messages", () => {
    const state: InterviewState = {
      sessionId: "test",
      turns: [
        { role: "assistant", content: "Tell me about your secret sauce." },
        { role: "user", content: "We use React for the frontend." },
      ],
      complete: true,
      turnCount: 1,
    };

    const topics = extractTopics(state);

    expect(topics.some((t) => /react/i.test(t))).toBe(true);
    expect(topics.some((t) => /secret sauce/i.test(t))).toBe(false);
  });

  it("returns empty array for no user messages", () => {
    const state: InterviewState = {
      sessionId: "test",
      turns: [],
      complete: true,
      turnCount: 0,
    };

    expect(extractTopics(state)).toEqual([]);
  });
});

describe("evaluateCoverage", () => {
  it("scores high when topics appear in docs", () => {
    const state = makeState([
      "Building a task management CLI in TypeScript",
      "It needs recurring tasks and notifications",
    ]);
    const docs: Required<GeneratedDocs> = {
      vision:
        "# Vision\n\nA task management CLI built with TypeScript for managing recurring tasks.",
      prd: "# PRD\n\nSupports notifications and recurring task scheduling.",
      architecture:
        "# Architecture\n\nTypeScript CLI using task management patterns.",
      milestones:
        "# Milestones\n\nBuild the task management CLI with notifications.",
    };

    const result = evaluateCoverage(state, docs);
    // All single-word topics covered; some bigrams may not match as exact
    // phrases (e.g., "cli typescript" vs "TypeScript CLI") — this is
    // intentional strictness for bigram matching.
    expect(result.score).toBeGreaterThan(0.75);
  });

  it("scores 1.0 when all topics including bigrams appear as exact phrases", () => {
    const state = makeState(["Building a task management tool"]);
    const docs: Required<GeneratedDocs> = {
      vision: "# Vision\n\nA task management tool for teams.",
      prd: "# PRD\n\nThe task management tool handles projects.",
      architecture: "# Architecture\n\nTask management tool architecture.",
      milestones: "# Milestones\n\nDeliver the task management tool.",
    };

    const result = evaluateCoverage(state, docs);
    expect(result.score).toBe(1.0);
  });

  it("scores less than 1.0 when topics are missing from docs", () => {
    const state = makeState([
      "Building a task management CLI in TypeScript",
      "It needs WebSocket support for real-time sync",
    ]);
    const docs: Required<GeneratedDocs> = {
      vision: "# Vision\n\nA task management tool.",
      prd: "# PRD\n\nManage tasks.",
      architecture: "# Architecture\n\nSimple CLI.",
      milestones: "# Milestones\n\nBuild it.",
    };

    const result = evaluateCoverage(state, docs);
    expect(result.score).toBeLessThan(1.0);
    expect(result.diagnostics.some((d) => /websocket/i.test(d.message))).toBe(
      true,
    );
  });

  it("handles empty interview gracefully", () => {
    const state = makeState([]);
    const docs: Required<GeneratedDocs> = {
      vision: "# Vision",
      prd: "# PRD",
      architecture: "# Architecture",
      milestones: "# Milestones",
    };

    const result = evaluateCoverage(state, docs);
    // No topics to check = perfect score (vacuously true)
    expect(result.score).toBe(1.0);
  });
});
