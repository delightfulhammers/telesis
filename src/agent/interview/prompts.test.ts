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
  });
});
