import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { ReviewSession, ReviewFinding } from "./types.js";
import { saveReviewSession } from "./store.js";
import { extractThemes } from "./themes.js";
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

  it("limits to N most recent sessions", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "reviews"), { recursive: true });

    // Create 4 sessions, only 2 most recent should be read
    for (let i = 0; i < 4; i++) {
      const id = `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee${i}`;
      const session = makeSession(id, `2026-03-1${i}T12:00:00Z`);
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
});
