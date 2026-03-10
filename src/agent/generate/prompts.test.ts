import { describe, it, expect } from "vitest";
import { buildGenerationPrompt } from "./prompts.js";
import type { InterviewState } from "../interview/state.js";
import type { GeneratedDocs } from "./types.js";
import type { InterviewTopics } from "./topics.js";

const makeState = (
  turns: Array<{ role: "user" | "assistant"; content: string }> = [],
): InterviewState => ({
  sessionId: "test-session",
  turns,
  complete: true,
  turnCount: turns.filter((t) => t.role === "user").length,
});

describe("buildGenerationPrompt", () => {
  it("includes document-specific instructions for vision", () => {
    const prompt = buildGenerationPrompt("vision", makeState(), {});
    expect(prompt).toContain("VISION.md");
    expect(prompt).toContain("Principles");
  });

  it("includes document-specific instructions for prd", () => {
    const prompt = buildGenerationPrompt("prd", makeState(), {});
    expect(prompt).toContain("PRD.md");
    expect(prompt).toContain("User Journeys");
  });

  it("includes document-specific instructions for architecture", () => {
    const prompt = buildGenerationPrompt("architecture", makeState(), {});
    expect(prompt).toContain("ARCHITECTURE.md");
    expect(prompt).toContain("Components");
  });

  it("includes document-specific instructions for milestones", () => {
    const prompt = buildGenerationPrompt("milestones", makeState(), {});
    expect(prompt).toContain("MILESTONES.md");
    expect(prompt).toContain("Acceptance Criteria");
  });

  it("includes conversation history from interview", () => {
    const state = makeState([
      { role: "assistant", content: "What are you building?" },
      { role: "user", content: "A CLI tool for project management." },
    ]);

    const prompt = buildGenerationPrompt("vision", state, {});
    expect(prompt).toContain("CLI tool for project management");
    expect(prompt).toContain("Developer:");
    expect(prompt).toContain("Interviewer:");
  });

  it("includes previously generated documents", () => {
    const previousDocs: GeneratedDocs = {
      vision: "# Vision\n\nThis is the vision.",
    };

    const prompt = buildGenerationPrompt("prd", makeState(), previousDocs);
    expect(prompt).toContain("Previously generated: VISION.md");
    expect(prompt).toContain("This is the vision.");
  });

  it("includes multiple previous documents for later generations", () => {
    const previousDocs: GeneratedDocs = {
      vision: "# Vision content",
      prd: "# PRD content",
      architecture: "# Architecture content",
    };

    const prompt = buildGenerationPrompt(
      "milestones",
      makeState(),
      previousDocs,
    );
    expect(prompt).toContain("Previously generated: VISION.md");
    expect(prompt).toContain("Previously generated: PRD.md");
    expect(prompt).toContain("Previously generated: ARCHITECTURE.md");
  });

  it("omits previous docs section when no docs provided", () => {
    const prompt = buildGenerationPrompt("vision", makeState(), {});
    expect(prompt).not.toContain("Previously generated:");
  });

  it("instructs model to return only markdown", () => {
    const prompt = buildGenerationPrompt("vision", makeState(), {});
    expect(prompt).toContain("ONLY the markdown document");
  });

  it("includes topics summary when provided", () => {
    const topics: InterviewTopics = {
      features: ["task management", "notifications"],
      preferences: ["functional programming"],
      technologies: ["TypeScript"],
      outOfScope: ["mobile app"],
      successCriteria: [],
      architectureHints: [],
    };

    const prompt = buildGenerationPrompt("vision", makeState(), {}, topics);
    expect(prompt).toContain("Topics from interview");
    expect(prompt).toContain("- task management");
    expect(prompt).toContain("- functional programming");
    expect(prompt).toContain("- TypeScript");
    expect(prompt).toContain("- mobile app");
  });

  it("omits topics section when not provided", () => {
    const prompt = buildGenerationPrompt("vision", makeState(), {});
    expect(prompt).not.toContain("Topics from interview");
  });

  it("omits topics section when all categories are empty", () => {
    const topics: InterviewTopics = {
      features: [],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    };

    const prompt = buildGenerationPrompt("vision", makeState(), {}, topics);
    expect(prompt).not.toContain("Topics from interview");
  });

  it("places topics before conversation context", () => {
    const topics: InterviewTopics = {
      features: ["chat feature"],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    };

    const state = makeState([
      { role: "user", content: "I want a chat feature." },
    ]);

    const prompt = buildGenerationPrompt("prd", state, {}, topics);
    const topicsIndex = prompt.indexOf("Topics from interview");
    const contextIndex = prompt.indexOf("Project context");
    expect(topicsIndex).toBeLessThan(contextIndex);
  });

  describe("vision prompt — principle quality (#15)", () => {
    it("instructs against restating features as principles", () => {
      const prompt = buildGenerationPrompt("vision", makeState(), {});
      expect(prompt).toContain("Do not restate features as principles");
    });

    it("instructs principles to guide ambiguous decisions", () => {
      const prompt = buildGenerationPrompt("vision", makeState(), {});
      expect(prompt).toContain("resolve ambiguous design decisions");
    });
  });

  describe("architecture prompt — decided vs suggested (#17)", () => {
    it("instructs to distinguish decided from suggested technologies", () => {
      const prompt = buildGenerationPrompt("architecture", makeState(), {});
      expect(prompt).toContain("explicitly chosen");
    });

    it("instructs to frame undiscussed choices as options", () => {
      const prompt = buildGenerationPrompt("architecture", makeState(), {});
      expect(prompt).toContain("options to evaluate");
    });
  });
});
