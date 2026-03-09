import { describe, it, expect } from "vitest";
import { buildGenerationPrompt } from "./prompts.js";
import type { InterviewState } from "../interview/state.js";
import type { GeneratedDocs } from "./types.js";

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
});
