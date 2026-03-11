import { describe, it, expect } from "vitest";
import {
  buildSinglePassPrompt,
  buildPersonaSystemPrompt,
  buildUserMessage,
  buildDedupPrompt,
  buildThemeExtractionPrompt,
} from "./prompts.js";
import type { ReviewContext, PersonaDefinition } from "./types.js";

const context: ReviewContext = {
  conventions: "No process.exit in business logic.",
  projectName: "TestProject",
  primaryLanguage: "TypeScript",
};

describe("buildSinglePassPrompt", () => {
  it("includes project name and language", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("TestProject");
    expect(prompt).toContain("TypeScript");
  });

  it("includes project conventions", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("No process.exit in business logic");
  });

  it("includes severity definitions", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("critical");
    expect(prompt).toContain("high");
    expect(prompt).toContain("medium");
    expect(prompt).toContain("low");
  });

  it("includes category definitions", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("bug");
    expect(prompt).toContain("security");
    expect(prompt).toContain("architecture");
  });

  it("specifies JSON response format", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("JSON array");
  });

  it("omits themes section when no themes provided", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).not.toContain("Previously Resolved Issues");
  });

  it("includes themes section when themes provided", () => {
    const prompt = buildSinglePassPrompt(context, [
      "path traversal via session ID",
      "shell injection in git commands",
    ]);
    expect(prompt).toContain("Previously Resolved Issues");
    expect(prompt).toContain("path traversal via session ID");
    expect(prompt).toContain("shell injection in git commands");
    expect(prompt).toContain("Do NOT re-report");
  });

  it("includes confidence guidelines", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("Confidence Scoring");
    expect(prompt).toContain("90-100");
    expect(prompt).toContain("Below 50");
  });

  it("includes anti-pattern guidance", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain("What NOT to Report");
    expect(prompt).toContain("Hedging");
    expect(prompt).toContain("Self-dismissing");
    expect(prompt).toContain("Over-engineering");
  });

  it("includes confidence field in response format", () => {
    const prompt = buildSinglePassPrompt(context);
    expect(prompt).toContain('"confidence"');
  });

  it("renders enriched theme conclusions", () => {
    const prompt = buildSinglePassPrompt(
      context,
      ["redirect prevention"],
      [
        {
          theme: "redirect prevention in HTTP calls",
          conclusion:
            "All fetch calls use redirect: 'error' to prevent credential leaks",
          antiPattern:
            "Do not suggest removing redirect: 'error' or switching to follow mode",
        },
      ],
    );
    expect(prompt).toContain("### redirect prevention in HTTP calls");
    expect(prompt).toContain(
      "**Conclusion:** All fetch calls use redirect: 'error' to prevent credential leaks",
    );
    expect(prompt).toContain(
      "**Do NOT suggest:** Do not suggest removing redirect: 'error'",
    );
  });
});

describe("buildPersonaSystemPrompt", () => {
  const persona: PersonaDefinition = {
    slug: "security",
    name: "Security Reviewer",
    preamble: "You are a security expert. Focus on vulnerabilities.",
    focusCategories: ["security", "bug"],
    ignoreCategories: ["style"],
  };

  it("includes persona name and project info", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("Security Reviewer");
    expect(prompt).toContain("TestProject");
    expect(prompt).toContain("TypeScript");
  });

  it("includes persona preamble", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("You are a security expert");
  });

  it("includes focus and ignore directives", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("Focus primarily on: security, bug");
    expect(prompt).toContain("You may skip: style");
  });

  it("includes project conventions", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("No process.exit in business logic");
  });

  it("includes response format and severity guidelines", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("critical");
  });

  it("includes themes when provided", () => {
    const prompt = buildPersonaSystemPrompt(persona, context, [
      "input validation on CLI args",
    ]);
    expect(prompt).toContain("Previously Resolved Issues");
    expect(prompt).toContain("input validation on CLI args");
  });

  it("includes anti-patterns in persona prompts", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("What NOT to Report");
    expect(prompt).toContain("Hedging");
  });

  it("includes confidence guidelines in persona prompts", () => {
    const prompt = buildPersonaSystemPrompt(persona, context);
    expect(prompt).toContain("Confidence Scoring");
  });

  it("omits focus section when no focus or ignore categories", () => {
    const minimal: PersonaDefinition = {
      slug: "minimal",
      name: "Minimal Reviewer",
      preamble: "Review everything.",
      focusCategories: [],
      ignoreCategories: [],
    };
    const prompt = buildPersonaSystemPrompt(minimal, context);
    expect(prompt).not.toContain("Focus primarily on:");
    expect(prompt).not.toContain("You may skip:");
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

describe("buildDedupPrompt", () => {
  it("includes candidate findings as JSON", () => {
    const candidates = [
      {
        id: "a",
        persona: "security",
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        description: "null deref",
        suggestion: "add null check",
      },
    ];
    const prompt = buildDedupPrompt(candidates);
    expect(prompt).toContain('"id": "a"');
    expect(prompt).toContain("deduplication");
    expect(prompt).toContain("keepId");
  });
});

describe("buildThemeExtractionPrompt", () => {
  it("includes findings and requests structured themes", () => {
    const findings = [
      {
        severity: "high",
        category: "security",
        path: "src/foo.ts",
        description: "SQL injection risk",
      },
    ];
    const prompt = buildThemeExtractionPrompt(findings);
    expect(prompt).toContain("SQL injection risk");
    expect(prompt).toContain("theme");
    expect(prompt).toContain("conclusion");
    expect(prompt).toContain("antiPattern");
    expect(prompt).toContain("JSON object");
  });
});
