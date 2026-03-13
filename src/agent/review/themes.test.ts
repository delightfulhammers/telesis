import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { ReviewSession, ReviewFinding, ThemeConclusion } from "./types.js";
import { saveReviewSession } from "./store.js";
import { extractThemes, filterByAntiPatterns } from "./themes.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("themes-test");

const makeClient = (content: string): ModelClient => ({
  complete: async (_req: CompletionRequest): Promise<CompletionResponse> => ({
    content,
    usage: { inputTokens: 50, outputTokens: 30 },
    durationMs: 200,
  }),
  completeStream: () => {
    throw new Error("not implemented");
  },
});

const makeSession = (id: string, timestamp: string): ReviewSession => ({
  id,
  timestamp,
  ref: "staged changes",
  files: [{ path: "src/foo.ts", status: "modified" }],
  findingCount: 2,
  model: "claude-sonnet-4-6",
  durationMs: 500,
  tokenUsage: { inputTokens: 100, outputTokens: 50 },
  mode: "single",
});

const makeFinding = (
  id: string,
  sessionId: string,
  description: string,
): ReviewFinding => ({
  id,
  sessionId,
  severity: "medium",
  category: "bug",
  path: "src/foo.ts",
  description,
  suggestion: "Fix it",
});

const seedFindings = (dir: string): void => {
  mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });
  const session = makeSession(
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "2026-03-10T12:00:00Z",
  );
  const findings = [
    makeFinding("f1", session.id, "SQL injection risk"),
    makeFinding("f2", session.id, "Path traversal vulnerability"),
    makeFinding("f3", session.id, "Missing input validation"),
  ];
  saveReviewSession(dir, { ...session, findingCount: 3 }, findings);
};

describe("extractThemes", () => {
  it("returns empty themes when no prior sessions exist", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    const client = makeClient("should not be called");
    const result = await extractThemes(dir, client, "model");
    expect(result.themes).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(result.recentFindings).toEqual([]);
    expect(result.tokenUsage).toBeUndefined();
  });

  it("returns empty themes when insufficient findings", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    const session = makeSession(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "2026-03-10T12:00:00Z",
    );
    const findings = [makeFinding("f1", session.id, "One finding")];
    saveReviewSession(dir, { ...session, findingCount: 1 }, findings);

    const client = makeClient("should not be called");
    const result = await extractThemes(dir, client, "model");
    expect(result.themes).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(result.recentFindings).toHaveLength(1);
  });

  it("extracts structured themes with conclusions", async () => {
    const dir = makeTempDir();
    seedFindings(dir);

    const response = JSON.stringify({
      themes: ["SQL injection", "path traversal", "input validation"],
      conclusions: [
        {
          theme: "SQL injection in query builder",
          conclusion: "All queries use parameterized statements",
          antiPattern:
            "Do not suggest additional SQL escaping on parameterized queries",
        },
      ],
    });
    const client = makeClient(response);
    const result = await extractThemes(dir, client, "model");

    expect(result.themes).toEqual([
      "SQL injection",
      "path traversal",
      "input validation",
    ]);
    expect(result.conclusions).toHaveLength(1);
    expect(result.conclusions[0].theme).toBe("SQL injection in query builder");
    expect(result.conclusions[0].conclusion).toBe(
      "All queries use parameterized statements",
    );
    expect(result.conclusions[0].antiPattern).toContain("Do not suggest");
    expect(result.recentFindings).toHaveLength(3);
    expect(result.tokenUsage).toBeDefined();
  });

  it("falls back to bare themes on old-format array response", async () => {
    const dir = makeTempDir();
    seedFindings(dir);

    const themes = '["SQL injection", "path traversal", "input validation"]';
    const client = makeClient(themes);
    const result = await extractThemes(dir, client, "model");

    expect(result.themes).toEqual([
      "SQL injection",
      "path traversal",
      "input validation",
    ]);
    expect(result.conclusions).toEqual([]);
    expect(result.tokenUsage).toBeDefined();
  });

  it("falls back gracefully on malformed conclusions", async () => {
    const dir = makeTempDir();
    seedFindings(dir);

    const response = JSON.stringify({
      themes: ["valid theme"],
      conclusions: [
        { theme: "incomplete" },
        {
          theme: "valid",
          conclusion: "this is valid",
          antiPattern: "do not do X",
        },
      ],
    });
    const client = makeClient(response);
    const result = await extractThemes(dir, client, "model");

    expect(result.themes).toEqual(["valid theme"]);
    // Only the valid conclusion passes the type guard
    expect(result.conclusions).toHaveLength(1);
    expect(result.conclusions[0].theme).toBe("valid");
  });

  it("returns empty themes on LLM failure", async () => {
    const dir = makeTempDir();
    seedFindings(dir);

    const failClient: ModelClient = {
      complete: async () => {
        throw new Error("API error");
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    const result = await extractThemes(dir, failClient, "model");
    expect(result.themes).toEqual([]);
    expect(result.conclusions).toEqual([]);
  });

  it("limits to N most recent sessions (distinct refs)", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    // Create 4 sessions with different refs, only 2 most recent should be read
    for (let i = 0; i < 4; i++) {
      const id = `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee${i}`;
      const session = {
        ...makeSession(id, `2026-03-1${i}T12:00:00Z`),
        ref: `HEAD~${i}`,
      };
      const findings = [
        makeFinding(`f${i}a`, id, `Finding ${i}a`),
        makeFinding(`f${i}b`, id, `Finding ${i}b`),
      ];
      saveReviewSession(dir, { ...session, findingCount: 2 }, findings);
    }

    let capturedPrompt = "";
    const client: ModelClient = {
      complete: async (req: CompletionRequest): Promise<CompletionResponse> => {
        capturedPrompt = req.messages[0].content;
        return {
          content: JSON.stringify({
            themes: ["theme"],
            conclusions: [],
          }),
          usage: { inputTokens: 50, outputTokens: 30 },
          durationMs: 200,
        };
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    await extractThemes(dir, client, "model", 2);
    // Should contain findings from sessions 2 and 3 (most recent) but not 0 and 1
    expect(capturedPrompt).toContain("Finding 3a");
    expect(capturedPrompt).toContain("Finding 2a");
    expect(capturedPrompt).not.toContain("Finding 0a");
  });

  it("deduplicates sessions by ref, keeping only the most recent", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    // Two sessions for the same ref — only the latest should contribute findings
    const oldId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee0";
    const newId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1";

    const oldSession = {
      ...makeSession(oldId, "2026-03-10T12:00:00Z"),
      ref: "HEAD~1",
    };
    const newSession = {
      ...makeSession(newId, "2026-03-11T12:00:00Z"),
      ref: "HEAD~1",
    };

    saveReviewSession(dir, { ...oldSession, findingCount: 2 }, [
      makeFinding("old-1", oldId, "Old resolved finding"),
      makeFinding("old-2", oldId, "Another old finding"),
    ]);
    saveReviewSession(dir, { ...newSession, findingCount: 1 }, [
      makeFinding("new-1", newId, "Still active finding"),
    ]);

    // Add a third session with a different ref to meet MIN_FINDINGS_FOR_THEMES
    const otherId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2";
    const otherSession = {
      ...makeSession(otherId, "2026-03-12T12:00:00Z"),
      ref: "HEAD~2",
    };
    saveReviewSession(dir, { ...otherSession, findingCount: 2 }, [
      makeFinding("other-1", otherId, "Other finding one"),
      makeFinding("other-2", otherId, "Other finding two"),
    ]);

    let capturedPrompt = "";
    const client: ModelClient = {
      complete: async (req: CompletionRequest): Promise<CompletionResponse> => {
        capturedPrompt = req.messages[0].content;
        return {
          content: JSON.stringify({ themes: [], conclusions: [] }),
          usage: { inputTokens: 50, outputTokens: 30 },
          durationMs: 200,
        };
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    await extractThemes(dir, client, "model");

    // Should include the latest session for HEAD~1 (new-1) but NOT old sessions
    expect(capturedPrompt).toContain("Still active finding");
    expect(capturedPrompt).not.toContain("Old resolved finding");
    expect(capturedPrompt).not.toContain("Another old finding");
    // Other ref's findings should be included
    expect(capturedPrompt).toContain("Other finding one");
  });
});

describe("filterByAntiPatterns", () => {
  const conclusions: readonly ThemeConclusion[] = [
    {
      theme: "redirect prevention in fetch calls",
      conclusion: "All fetch calls use redirect: 'error' intentionally",
      antiPattern: "Do not suggest removing redirect error option from fetch",
    },
    {
      theme: "SQL injection in query builder",
      conclusion: "All queries use parameterized statements",
      antiPattern:
        "Do not suggest additional SQL escaping on parameterized queries",
    },
  ];

  it("filters findings matching an anti-pattern by Jaccard similarity", () => {
    const findings: readonly ReviewFinding[] = [
      makeFinding(
        "f1",
        "s1",
        "Consider removing the redirect error option from fetch calls for simplicity",
      ),
    ];
    const result = filterByAntiPatterns(findings, conclusions);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
  });

  it("keeps findings that do not match any anti-pattern", () => {
    const findings: readonly ReviewFinding[] = [
      makeFinding("f1", "s1", "Missing null check on user input validation"),
    ];
    const result = filterByAntiPatterns(findings, conclusions);
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);
  });

  it("returns all findings when no conclusions are provided", () => {
    const findings: readonly ReviewFinding[] = [
      makeFinding("f1", "s1", "Some finding about redirect error handling"),
    ];
    const result = filterByAntiPatterns(findings, []);
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);
  });

  it("filters multiple findings matching different anti-patterns", () => {
    const findings: readonly ReviewFinding[] = [
      makeFinding(
        "f1",
        "s1",
        "Remove the redirect error option from the fetch call",
      ),
      makeFinding(
        "f2",
        "s1",
        "Add additional SQL escaping on parameterized queries for safety",
      ),
      makeFinding("f3", "s1", "Unrelated bug in error handling"),
    ];
    const result = filterByAntiPatterns(findings, conclusions);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].id).toBe("f3");
    expect(result.filteredCount).toBe(2);
  });

  it("supports custom similarity threshold", () => {
    const findings: readonly ReviewFinding[] = [
      makeFinding(
        "f1",
        "s1",
        "The redirect error option could be reconsidered",
      ),
    ];
    // With a very high threshold, marginal matches survive
    const strict = filterByAntiPatterns(findings, conclusions, 0.9);
    expect(strict.findings).toHaveLength(1);
    // With a low threshold, they get filtered
    const lenient = filterByAntiPatterns(findings, conclusions, 0.15);
    expect(lenient.findings).toHaveLength(0);
  });
});
