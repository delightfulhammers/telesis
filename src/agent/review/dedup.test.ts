import { describe, it, expect } from "vitest";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { PersonaResult, ReviewFinding } from "./types.js";
import { groupDedupCandidates, deduplicateFindings } from "./dedup.js";

const finding = (
  overrides: Partial<ReviewFinding> & { id: string },
): ReviewFinding => ({
  sessionId: "session-1",
  severity: "medium",
  category: "bug",
  path: "src/foo.ts",
  description: "A problem",
  suggestion: "Fix it",
  ...overrides,
});

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

describe("groupDedupCandidates", () => {
  it("groups findings on the same file with overlapping lines", () => {
    const findings = [
      finding({ id: "a", path: "src/foo.ts", startLine: 10, endLine: 20 }),
      finding({ id: "b", path: "src/foo.ts", startLine: 15, endLine: 25 }),
    ];

    const groups = groupDedupCandidates(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("does not group findings on different files", () => {
    const findings = [
      finding({ id: "a", path: "src/foo.ts", startLine: 10 }),
      finding({ id: "b", path: "src/bar.ts", startLine: 10 }),
    ];

    const groups = groupDedupCandidates(findings);
    expect(groups).toHaveLength(0);
  });

  it("does not group findings with non-overlapping lines", () => {
    const findings = [
      finding({ id: "a", path: "src/foo.ts", startLine: 10, endLine: 15 }),
      finding({ id: "b", path: "src/foo.ts", startLine: 20, endLine: 25 }),
    ];

    const groups = groupDedupCandidates(findings);
    expect(groups).toHaveLength(0);
  });

  it("groups findings when both lack line numbers", () => {
    const findings = [
      finding({ id: "a", path: "src/foo.ts" }),
      finding({ id: "b", path: "src/foo.ts" }),
    ];

    const groups = groupDedupCandidates(findings);
    expect(groups).toHaveLength(1);
  });

  it("does not group when one has lines and the other does not", () => {
    const findings = [
      finding({ id: "a", path: "src/foo.ts", startLine: 10 }),
      finding({ id: "b", path: "src/foo.ts" }),
    ];

    const groups = groupDedupCandidates(findings);
    expect(groups).toHaveLength(0);
  });

  it("returns empty for single findings per file", () => {
    const findings = [finding({ id: "a", path: "src/foo.ts", startLine: 10 })];
    const groups = groupDedupCandidates(findings);
    expect(groups).toHaveLength(0);
  });
});

describe("deduplicateFindings", () => {
  it("returns findings unmodified when no candidates exist", async () => {
    const results: PersonaResult[] = [
      {
        persona: "security",
        findings: [finding({ id: "a", path: "src/foo.ts", startLine: 10 })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
      {
        persona: "architecture",
        findings: [finding({ id: "b", path: "src/bar.ts", startLine: 10 })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
    ];

    const client = makeClient("[]");
    const result = await deduplicateFindings(results, client, "model");
    expect(result.findings).toHaveLength(2);
    expect(result.mergedCount).toBe(0);
  });

  it("merges duplicate findings keeping highest severity", async () => {
    const results: PersonaResult[] = [
      {
        persona: "security",
        findings: [
          finding({
            id: "a",
            path: "src/foo.ts",
            startLine: 10,
            severity: "high",
            persona: "security",
            description: "Security issue",
            suggestion: "Validate input",
          }),
        ],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
      {
        persona: "correctness",
        findings: [
          finding({
            id: "b",
            path: "src/foo.ts",
            startLine: 10,
            severity: "medium",
            persona: "correctness",
            description: "Missing validation",
            suggestion: "Add null check",
          }),
        ],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
    ];

    const dedupResponse = JSON.stringify([
      { keepId: "a", duplicateIds: ["b"] },
    ]);
    const client = makeClient(dedupResponse);

    const result = await deduplicateFindings(results, client, "model");
    expect(result.findings).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(result.findings[0].severity).toBe("high");
    expect(result.findings[0].dedupGroupId).toBeDefined();
    expect(result.findings[0].suggestion).toContain("[security]");
    expect(result.findings[0].suggestion).toContain("[correctness]");
  });

  it("returns all findings on LLM failure", async () => {
    const results: PersonaResult[] = [
      {
        persona: "security",
        findings: [finding({ id: "a", path: "src/foo.ts", startLine: 10 })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
      {
        persona: "correctness",
        findings: [finding({ id: "b", path: "src/foo.ts", startLine: 10 })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
    ];

    const failClient: ModelClient = {
      complete: async () => {
        throw new Error("API error");
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    const result = await deduplicateFindings(results, failClient, "model");
    expect(result.findings).toHaveLength(2);
    expect(result.mergedCount).toBe(0);
  });

  it("skips dedup when fewer than 2 total findings", async () => {
    const results: PersonaResult[] = [
      {
        persona: "security",
        findings: [finding({ id: "a" })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
    ];

    const client = makeClient("should not be called");
    const result = await deduplicateFindings(results, client, "model");
    expect(result.findings).toHaveLength(1);
    expect(result.mergedCount).toBe(0);
  });

  it("includes token usage from dedup call", async () => {
    const results: PersonaResult[] = [
      {
        persona: "security",
        findings: [finding({ id: "a", path: "src/foo.ts" })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
      {
        persona: "correctness",
        findings: [finding({ id: "b", path: "src/foo.ts" })],
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 500,
      },
    ];

    const client = makeClient("[]");
    const result = await deduplicateFindings(results, client, "model");
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.inputTokens).toBe(50);
  });
});
