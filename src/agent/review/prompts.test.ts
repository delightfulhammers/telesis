import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserMessage } from "./prompts.js";
import type { ReviewContext } from "./types.js";

describe("buildSystemPrompt", () => {
  const context: ReviewContext = {
    conventions: "No process.exit in business logic.",
    projectName: "TestProject",
    primaryLanguage: "TypeScript",
  };

  it("includes project name and language", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("TestProject");
    expect(prompt).toContain("TypeScript");
  });

  it("includes project conventions", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("No process.exit in business logic");
  });

  it("includes severity definitions", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("critical");
    expect(prompt).toContain("high");
    expect(prompt).toContain("medium");
    expect(prompt).toContain("low");
  });

  it("includes category definitions", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("bug");
    expect(prompt).toContain("security");
    expect(prompt).toContain("architecture");
  });

  it("specifies JSON response format", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("JSON array");
  });
});

describe("buildUserMessage", () => {
  it("includes diff and file list", () => {
    const msg = buildUserMessage("+ const x = 1;", "- src/foo.ts (added)");
    expect(msg).toContain("const x = 1");
    expect(msg).toContain("src/foo.ts (added)");
  });

  it("wraps diff in code fence", () => {
    const msg = buildUserMessage("diff content", "files");
    expect(msg).toContain("```diff");
    expect(msg).toContain("diff content");
    expect(msg).toContain("```");
  });
});
