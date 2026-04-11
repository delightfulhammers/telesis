import { describe, it, expect } from "vitest";
import { buildInterviewSystemPrompt, hasCompletionSignal } from "./prompts.js";

describe("interview prompts", () => {
  describe("buildInterviewSystemPrompt", () => {
    it("includes required fields to collect", () => {
      const prompt = buildInterviewSystemPrompt();
      expect(prompt).toContain("name");
      expect(prompt).toContain("owner");
      expect(prompt).toContain("purpose");
      expect(prompt).toContain("primaryLanguage");
      expect(prompt).toContain("constraints");
      expect(prompt).toContain("successCriteria");
      expect(prompt).toContain("architectureHints");
      expect(prompt).toContain("outOfScope");
    });

    it("includes the completion signal format", () => {
      const prompt = buildInterviewSystemPrompt();
      expect(prompt).toContain("interviewComplete");
    });

    it("mentions /done sentinel", () => {
      const prompt = buildInterviewSystemPrompt();
      expect(prompt).toContain("/done");
    });

    it("includes codebase summary when provided", () => {
      const prompt = buildInterviewSystemPrompt({
        codebaseSummary: "## Existing Codebase\npackage.json found",
      });
      expect(prompt).toContain("Existing Codebase");
    });

    it("includes discovered docs when provided", () => {
      const prompt = buildInterviewSystemPrompt({
        discoveredDocs: [
          {
            relPath: "docs/ARCHITECTURE.md",
            type: "architecture",
            content: "# Architecture\n\nService mesh with gRPC.",
          },
          {
            relPath: "docs/adr/ADR-001-storage.md",
            type: "adr",
            content: "# ADR-001: Storage\n\nUse PostgreSQL.",
          },
        ],
      });
      expect(prompt).toContain("docs/ARCHITECTURE.md");
      expect(prompt).toContain("Service mesh with gRPC");
      expect(prompt).toContain("docs/adr/ADR-001-storage.md");
      expect(prompt).toContain("existing-docs");
    });

    it("instructs gap-filling mode when docs are provided", () => {
      const prompt = buildInterviewSystemPrompt({
        discoveredDocs: [
          {
            relPath: "docs/PRD.md",
            type: "prd",
            content: "# PRD\nRequirements here.",
          },
        ],
      });
      // Should instruct the interviewer NOT to re-ask documented content
      expect(prompt).toMatch(/do NOT ask.*re-explain|already.*documented/i);
    });

    it("works with no options (backward compatible)", () => {
      const prompt = buildInterviewSystemPrompt();
      expect(prompt).toContain("software architect");
      expect(prompt).not.toContain("existing-docs");
    });
  });

  describe("hasCompletionSignal", () => {
    it("detects completion signal in text", () => {
      const text =
        'Great, I have everything.\n```json\n{"interviewComplete": true}\n```';
      expect(hasCompletionSignal(text)).toBe(true);
    });

    it("returns false for text without signal", () => {
      expect(hasCompletionSignal("Just a regular response.")).toBe(false);
    });

    it("returns false for partial signal", () => {
      expect(hasCompletionSignal('"interviewComplete": false')).toBe(false);
    });

    it("detects signal without code fence", () => {
      expect(hasCompletionSignal('{"interviewComplete": true}')).toBe(true);
    });

    it("detects signal without spaces around colon", () => {
      expect(hasCompletionSignal('{"interviewComplete":true}')).toBe(true);
    });

    it("returns false for interviewComplete set to a string", () => {
      expect(hasCompletionSignal('{"interviewComplete": "true"}')).toBe(false);
    });
  });
});
