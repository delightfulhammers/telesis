import { describe, it, expect } from "vitest";
import {
  buildSinglePassPrompt,
  buildPersonaSystemPrompt,
  buildUserMessage,
  buildDedupPrompt,
  buildThemeExtractionPrompt,
  formatPriorFindings,
  formatDismissedFindings,
  buildVerificationPrompt,
} from "./prompts.js";
import type {
  ReviewContext,
  ReviewFinding,
  PersonaDefinition,
} from "./types.js";
import type { Dismissal } from "./dismissal/types.js";

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

  it("deduplicates bare themes covered by conclusion themes via substring match", () => {
    const prompt = buildSinglePassPrompt(
      context,
      ["redirect prevention", "unrelated theme"],
      [
        {
          theme: "redirect prevention in HTTP calls",
          conclusion: "All fetch calls use redirect: 'error'",
          antiPattern: "Do not suggest removing redirect: 'error'",
        },
      ],
    );
    // "redirect prevention" is a substring of the conclusion theme — should be suppressed
    expect(prompt).not.toContain("- redirect prevention");
    // "unrelated theme" has no matching conclusion — should appear
    expect(prompt).toContain("- unrelated theme");
  });

  it("does not over-suppress bare themes when conclusion theme is shorter", () => {
    const prompt = buildSinglePassPrompt(
      context,
      ["error handling in API calls"],
      [
        {
          theme: "error",
          conclusion: "Errors are logged",
          antiPattern: "Do not suppress errors",
        },
      ],
    );
    // "error" is a substring of "error handling in API calls" but the match
    // direction is wrong — conclusion should not suppress longer bare themes
    expect(prompt).toContain("- error handling in API calls");
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

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "test-id",
  sessionId: "test-session",
  severity: "high",
  category: "bug",
  path: "src/foo.ts",
  startLine: 42,
  endLine: 45,
  description: "Null reference possible",
  suggestion: "Add a null check",
  confidence: 80,
  ...overrides,
});

describe("formatPriorFindings", () => {
  it("returns empty string for no findings", () => {
    expect(formatPriorFindings([])).toBe("");
  });

  it("formats findings with location and metadata", () => {
    const result = formatPriorFindings([makeFinding()]);
    expect(result).toContain("Previously Reported Findings");
    expect(result).toContain("`src/foo.ts:42-45`");
    expect(result).toContain("[high/bug]");
    expect(result).toContain("Null reference possible");
    expect(result).toContain("Add a null check");
  });

  it("formats single-line findings without range", () => {
    const result = formatPriorFindings([
      makeFinding({ startLine: 10, endLine: undefined }),
    ]);
    expect(result).toContain("`src/foo.ts:10`");
  });

  it("formats findings without line info as path only", () => {
    const result = formatPriorFindings([
      makeFinding({ startLine: undefined, endLine: undefined }),
    ]);
    expect(result).toContain("`src/foo.ts`");
    // Should not have line numbers in the path backtick section
    expect(result).not.toContain("`src/foo.ts:");
  });

  it("includes persona when present", () => {
    const result = formatPriorFindings([makeFinding({ persona: "security" })]);
    expect(result).toContain("(security)");
  });

  it("caps at 30 findings", () => {
    const findings = Array.from({ length: 40 }, (_, i) =>
      makeFinding({ id: `f-${i}`, description: `Finding ${i}` }),
    );
    const result = formatPriorFindings(findings);
    expect(result).toContain("Finding 0");
    expect(result).toContain("Finding 29");
    expect(result).not.toContain("Finding 30");
  });

  it("instructs not to re-report", () => {
    const result = formatPriorFindings([makeFinding()]);
    expect(result).toContain("Do NOT re-report");
  });
});

describe("buildSinglePassPrompt with prior findings", () => {
  it("includes prior findings section when provided", () => {
    const prompt = buildSinglePassPrompt(context, [], [], [makeFinding()]);
    expect(prompt).toContain("Previously Reported Findings");
    expect(prompt).toContain("Null reference possible");
  });

  it("omits prior findings section when empty", () => {
    const prompt = buildSinglePassPrompt(context, [], [], []);
    expect(prompt).not.toContain("Previously Reported Findings");
  });
});

describe("buildPersonaSystemPrompt with prior findings", () => {
  const persona: PersonaDefinition = {
    slug: "security",
    name: "Security Reviewer",
    preamble: "Focus on security.",
    focusCategories: ["security"],
    ignoreCategories: [],
  };

  it("includes prior findings section when provided", () => {
    const prompt = buildPersonaSystemPrompt(
      persona,
      context,
      [],
      [],
      [makeFinding({ description: "SQL injection risk" })],
    );
    expect(prompt).toContain("Previously Reported Findings");
    expect(prompt).toContain("SQL injection risk");
  });
});

const makeDismissal = (overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: "dismissal-1",
  findingId: "finding-1",
  sessionId: "session-1",
  reason: "false-positive",
  timestamp: "2026-03-10T12:00:00Z",
  source: "cli",
  path: "src/foo.ts",
  severity: "high",
  category: "bug",
  description: "Null reference possible",
  suggestion: "Add a null check",
  ...overrides,
});

describe("formatDismissedFindings", () => {
  it("returns empty string for no dismissals", () => {
    expect(formatDismissedFindings([])).toBe("");
  });

  it("formats dismissals with path, severity, category, reason, description", () => {
    const result = formatDismissedFindings([makeDismissal()]);
    expect(result).toContain("Previously Dismissed Findings");
    expect(result).toContain("DO NOT RE-REPORT");
    expect(result).toContain("`src/foo.ts`");
    expect(result).toContain("[high/bug]");
    expect(result).toContain("dismissed: false-positive");
    expect(result).toContain("Null reference possible");
    expect(result).toContain("Original suggestion: Add a null check");
  });

  it("includes persona when present", () => {
    const result = formatDismissedFindings([
      makeDismissal({ persona: "security" }),
    ]);
    expect(result).toContain("(security)");
  });

  it("caps at 50 dismissals", () => {
    const dismissals = Array.from({ length: 60 }, (_, i) =>
      makeDismissal({ id: `d-${i}`, description: `Dismissal ${i}` }),
    );
    const result = formatDismissedFindings(dismissals);
    expect(result).toContain("Dismissal 0");
    expect(result).toContain("Dismissal 49");
    expect(result).not.toContain("Dismissal 50");
  });
});

describe("buildSinglePassPrompt with dismissed findings", () => {
  it("includes dismissed findings section when provided", () => {
    const prompt = buildSinglePassPrompt(
      context,
      [],
      [],
      [],
      [makeDismissal()],
    );
    expect(prompt).toContain("Previously Dismissed Findings");
    expect(prompt).toContain("Null reference possible");
  });

  it("omits dismissed findings section when empty", () => {
    const prompt = buildSinglePassPrompt(context, [], [], [], []);
    expect(prompt).not.toContain("Previously Dismissed Findings");
  });

  it("dismissed section appears after prior findings section", () => {
    const prompt = buildSinglePassPrompt(
      context,
      [],
      [],
      [makeFinding()],
      [makeDismissal()],
    );
    const priorIdx = prompt.indexOf("Previously Reported Findings");
    const dismissedIdx = prompt.indexOf("Previously Dismissed Findings");
    expect(priorIdx).toBeGreaterThan(-1);
    expect(dismissedIdx).toBeGreaterThan(priorIdx);
  });
});

describe("buildPersonaSystemPrompt with dismissed findings", () => {
  const testPersona: PersonaDefinition = {
    slug: "security",
    name: "Security Reviewer",
    preamble: "Focus on security.",
    focusCategories: ["security"],
    ignoreCategories: [],
  };

  it("includes dismissed findings section when provided", () => {
    const prompt = buildPersonaSystemPrompt(
      testPersona,
      context,
      [],
      [],
      [],
      [makeDismissal({ description: "SQL injection risk" })],
    );
    expect(prompt).toContain("Previously Dismissed Findings");
    expect(prompt).toContain("SQL injection risk");
  });
});

describe("buildVerificationPrompt", () => {
  it("includes file contents with line numbers", () => {
    const files = new Map([["src/foo.ts", "const x = 1;\nconst y = 2;"]]);
    const findings = [
      {
        index: 0,
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        startLine: 1,
        description: "Issue here",
        suggestion: "Fix it",
      },
    ];

    const prompt = buildVerificationPrompt(files, findings);
    expect(prompt).toContain("### File: src/foo.ts");
    expect(prompt).toContain("   1 | const x = 1;");
    expect(prompt).toContain("   2 | const y = 2;");
  });

  it("includes finding details with index", () => {
    const files = new Map([["src/foo.ts", "content"]]);
    const findings = [
      {
        index: 0,
        severity: "high",
        category: "security",
        path: "src/foo.ts",
        startLine: 5,
        endLine: 10,
        description: "SQL injection",
        suggestion: "Use parameterized queries",
      },
    ];

    const prompt = buildVerificationPrompt(files, findings);
    expect(prompt).toContain("[0]");
    expect(prompt).toContain("`src/foo.ts:5-10`");
    expect(prompt).toContain("[high/security]");
    expect(prompt).toContain("SQL injection");
    expect(prompt).toContain("Use parameterized queries");
  });

  it("includes verification instructions", () => {
    const files = new Map([["src/foo.ts", "content"]]);
    const findings = [
      {
        index: 0,
        severity: "medium",
        category: "bug",
        path: "src/foo.ts",
        description: "Test",
        suggestion: "Fix",
      },
    ];

    const prompt = buildVerificationPrompt(files, findings);
    expect(prompt).toContain("read the FULL file content");
    expect(prompt).toContain("Do NOT assume the finding is correct");
    expect(prompt).toContain("verified");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("evidence");
  });
});
