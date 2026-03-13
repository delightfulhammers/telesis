import { describe, it, expect } from "vitest";
import {
  buildReviewerPrompt,
  buildArchitectPrompt,
  buildChroniclerPrompt,
} from "./prompts.js";
import type { PolicyFile } from "./types.js";
import type { DispatchContext } from "../dispatch/context.js";

const makePolicy = (overrides: Partial<PolicyFile> = {}): PolicyFile => ({
  name: "test",
  version: 1,
  enabled: true,
  autonomy: "alert",
  trigger: "periodic",
  intervalEvents: 10,
  model: "claude-sonnet-4-6",
  systemPrompt: "",
  ...overrides,
});

const makeContext = (
  overrides: Partial<DispatchContext> = {},
): DispatchContext => ({
  projectName: "Telesis",
  primaryLanguage: "TypeScript",
  vision: "",
  architecture: "## Modules\n\nsrc/oversight/ — observer agents",
  conventions: "Use strict TypeScript. Prefer interfaces.",
  activeMilestone: "## v0.14.0\nActive Oversight & Chronicler",
  activeAdrs: "### ADR-002\nTypeScript rewrite",
  notes: "",
  claudeMd: "",
  ...overrides,
});

describe("buildReviewerPrompt", () => {
  it("includes the policy system prompt as preamble", () => {
    const policy = makePolicy({
      systemPrompt: "Custom reviewer instructions.",
    });
    const prompt = buildReviewerPrompt(policy, makeContext());
    expect(prompt).toContain("Custom reviewer instructions.");
  });

  it("includes project name and language", () => {
    const prompt = buildReviewerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("Telesis");
    expect(prompt).toContain("TypeScript");
  });

  it("includes conventions section", () => {
    const prompt = buildReviewerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("Use strict TypeScript");
  });

  it("includes active milestone", () => {
    const prompt = buildReviewerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("v0.14.0");
  });

  it("includes output format instructions", () => {
    const prompt = buildReviewerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("severity");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("JSON array");
  });

  it("omits conventions when empty", () => {
    const prompt = buildReviewerPrompt(
      makePolicy(),
      makeContext({ conventions: "" }),
    );
    expect(prompt).not.toContain("Project Conventions");
  });
});

describe("buildArchitectPrompt", () => {
  it("includes architecture section", () => {
    const prompt = buildArchitectPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("src/oversight/");
  });

  it("includes ADRs section", () => {
    const prompt = buildArchitectPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("ADR-002");
  });

  it("includes spec drift detection role", () => {
    const prompt = buildArchitectPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("spec drift");
  });

  it("includes policy system prompt", () => {
    const policy = makePolicy({ systemPrompt: "Custom architect rules." });
    const prompt = buildArchitectPrompt(policy, makeContext());
    expect(prompt).toContain("Custom architect rules.");
  });
});

describe("buildChroniclerPrompt", () => {
  it("includes chronicler role description", () => {
    const prompt = buildChroniclerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("Chronicler");
    expect(prompt).toContain("development insights");
  });

  it("includes notes output format", () => {
    const prompt = buildChroniclerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("text");
    expect(prompt).toContain("tags");
    expect(prompt).toContain("JSON array");
  });

  it("includes active milestone for context", () => {
    const prompt = buildChroniclerPrompt(makePolicy(), makeContext());
    expect(prompt).toContain("v0.14.0");
  });

  it("includes policy system prompt", () => {
    const policy = makePolicy({
      systemPrompt: "Focus on architectural patterns.",
    });
    const prompt = buildChroniclerPrompt(policy, makeContext());
    expect(prompt).toContain("Focus on architectural patterns.");
  });
});
