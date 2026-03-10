import { describe, it, expect } from "vitest";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { ChangedFile, ReviewContext } from "./types.js";
import { reviewDiff } from "./agent.js";

const makeClient = (content: string): ModelClient => ({
  complete: async (_req: CompletionRequest): Promise<CompletionResponse> => ({
    content,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 500,
  }),
  completeStream: () => {
    throw new Error("not implemented");
  },
});

const context: ReviewContext = {
  conventions: "No process.exit in business logic.",
  projectName: "TestProject",
  primaryLanguage: "TypeScript",
};

const files: readonly ChangedFile[] = [
  { path: "src/foo.ts", status: "modified" },
];

const SESSION_ID = "test-session-123";

describe("reviewDiff", () => {
  it("parses valid findings from model response", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        startLine: 10,
        endLine: 15,
        description: "Null check missing",
        suggestion: "Add a null check before accessing property",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("high");
    expect(result.findings[0].category).toBe("bug");
    expect(result.findings[0].path).toBe("src/foo.ts");
    expect(result.findings[0].description).toBe("Null check missing");
    expect(result.findings[0].sessionId).toBe(SESSION_ID);
    expect(result.findings[0].id).toBeDefined();
  });

  it("returns empty findings for empty array response", async () => {
    const client = makeClient("[]");
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toEqual([]);
  });

  it("strips markdown code fences from response", async () => {
    const findings = [
      {
        severity: "low",
        category: "style",
        path: "src/foo.ts",
        description: "Missing semicolon",
        suggestion: "Add semicolon",
      },
    ];
    const wrapped = "```json\n" + JSON.stringify(findings) + "\n```";

    const client = makeClient(wrapped);
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toHaveLength(1);
  });

  it("filters out findings with invalid severity", async () => {
    const findings = [
      {
        severity: "extreme",
        category: "bug",
        path: "src/foo.ts",
        description: "Bad severity",
        suggestion: "Fix it",
      },
      {
        severity: "medium",
        category: "bug",
        path: "src/foo.ts",
        description: "Good severity",
        suggestion: "Fix it",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toBe("Good severity");
  });

  it("filters out findings with invalid category", async () => {
    const findings = [
      {
        severity: "high",
        category: "unknown",
        path: "src/foo.ts",
        description: "Bad category",
        suggestion: "Fix it",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toEqual([]);
  });

  it("filters out findings missing required fields", async () => {
    const findings = [
      { severity: "high", category: "bug" },
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        description: "Has all fields",
        suggestion: "Fix it",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toHaveLength(1);
  });

  it("rejects negative line numbers", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        startLine: -5,
        endLine: 10,
        description: "Negative start",
        suggestion: "Fix it",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].startLine).toBeUndefined();
    expect(result.findings[0].endLine).toBe(10);
  });

  it("rejects non-integer line numbers", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        startLine: 10.5,
        endLine: 15,
        description: "Float start",
        suggestion: "Fix it",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].startLine).toBeUndefined();
    expect(result.findings[0].endLine).toBe(15);
  });

  it("drops endLine when it precedes startLine", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        startLine: 20,
        endLine: 10,
        description: "Reversed range",
        suggestion: "Fix it",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].startLine).toBe(20);
    expect(result.findings[0].endLine).toBeUndefined();
  });

  it("handles code fences without closing fence", async () => {
    const findings = [
      {
        severity: "low",
        category: "style",
        path: "src/foo.ts",
        description: "No closing fence",
        suggestion: "Fix it",
      },
    ];
    const wrapped = "```json\n" + JSON.stringify(findings);

    const client = makeClient(wrapped);
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toHaveLength(1);
  });

  it("handles optional line numbers", async () => {
    const findings = [
      {
        severity: "low",
        category: "style",
        path: "src/foo.ts",
        description: "General observation",
        suggestion: "Consider refactoring",
      },
    ];

    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].startLine).toBeUndefined();
    expect(result.findings[0].endLine).toBeUndefined();
  });

  it("returns token usage and duration", async () => {
    const client = makeClient("[]");
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.tokenUsage.inputTokens).toBe(100);
    expect(result.tokenUsage.outputTokens).toBe(50);
    expect(result.durationMs).toBe(500);
  });

  it("returns empty findings on malformed response", async () => {
    const client = makeClient("This is not JSON at all");
    const result = await reviewDiff(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings).toEqual([]);
  });

  it("throws on oversized diff", async () => {
    const client = makeClient("[]");
    const hugeDiff = "x".repeat(200_001);
    await expect(
      reviewDiff(
        client,
        hugeDiff,
        files,
        context,
        SESSION_ID,
        "claude-sonnet-4-6",
      ),
    ).rejects.toThrow("too large");
  });
});
