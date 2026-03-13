import { describe, it, expect } from "vitest";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { ChangedFile, ReviewContext } from "./types.js";
import {
  reviewDiff,
  reviewWithPersonas,
  filterByConfidence,
  escalateThresholds,
} from "./agent.js";
import { DEFAULT_CONFIDENCE_THRESHOLDS } from "./types.js";
import {
  securityPersona,
  architecturePersona,
  correctnessPersona,
} from "./personas.js";

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

  it("strips code fences with conversational preamble", async () => {
    const findings = [
      {
        severity: "medium",
        category: "bug",
        path: "src/foo.ts",
        description: "Found an issue",
        suggestion: "Fix it",
      },
    ];
    const wrapped =
      "Here are the findings from my review:\n\n```json\n" +
      JSON.stringify(findings) +
      "\n```\n\nLet me know if you need more details.";

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
    expect(result.findings[0].description).toBe("Found an issue");
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

  it("treats unclosed code fence as malformed response", async () => {
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
    // Unclosed fence means truncated/malformed response — no findings extracted
    expect(result.findings).toEqual([]);
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

describe("reviewWithPersonas", () => {
  it("runs multiple personas in parallel and tags findings", async () => {
    const secFinding = {
      severity: "high",
      category: "security",
      path: "src/foo.ts",
      description: "SQL injection",
      suggestion: "Use parameterized queries",
    };
    const archFinding = {
      severity: "medium",
      category: "architecture",
      path: "src/foo.ts",
      description: "Import violation",
      suggestion: "Move import to cli/",
    };

    let callCount = 0;
    const client: ModelClient = {
      complete: async (req: CompletionRequest): Promise<CompletionResponse> => {
        callCount++;
        const content = req.system?.includes("Security Reviewer")
          ? JSON.stringify([secFinding])
          : req.system?.includes("Architecture Reviewer")
            ? JSON.stringify([archFinding])
            : "[]";
        return {
          content,
          usage: { inputTokens: 100, outputTokens: 50 },
          durationMs: 500,
        };
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    const results = await reviewWithPersonas(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
      [securityPersona, architecturePersona],
    );

    expect(callCount).toBe(2);
    expect(results).toHaveLength(2);

    const secResult = results.find((r) => r.persona === "security");
    expect(secResult).toBeDefined();
    expect(secResult!.findings).toHaveLength(1);
    expect(secResult!.findings[0].persona).toBe("security");
    expect(secResult!.findings[0].description).toBe("SQL injection");

    const archResult = results.find((r) => r.persona === "architecture");
    expect(archResult).toBeDefined();
    expect(archResult!.findings).toHaveLength(1);
    expect(archResult!.findings[0].persona).toBe("architecture");
  });

  it("aggregates token usage per persona", async () => {
    const client = makeClient("[]");
    const results = await reviewWithPersonas(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
      [securityPersona, correctnessPersona],
    );

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.tokenUsage.inputTokens).toBe(100);
      expect(r.tokenUsage.outputTokens).toBe(50);
      expect(r.durationMs).toBe(500);
    }
  });

  it("handles malformed response from one persona gracefully", async () => {
    let callIdx = 0;
    const client: ModelClient = {
      complete: async (): Promise<CompletionResponse> => {
        callIdx++;
        return {
          content: callIdx === 1 ? "not json" : "[]",
          usage: { inputTokens: 100, outputTokens: 50 },
          durationMs: 500,
        };
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    const results = await reviewWithPersonas(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
      [securityPersona, architecturePersona],
    );

    // One persona fails parsing, other succeeds — both return results
    expect(results).toHaveLength(2);
    const failedPersona = results[0];
    expect(failedPersona.findings).toEqual([]);
  });

  it("uses persona-specific model when defined", async () => {
    const capturedModels: string[] = [];
    const client: ModelClient = {
      complete: async (req: CompletionRequest): Promise<CompletionResponse> => {
        capturedModels.push(req.model ?? "default");
        return {
          content: "[]",
          usage: { inputTokens: 100, outputTokens: 50 },
          durationMs: 500,
        };
      },
      completeStream: () => {
        throw new Error("not implemented");
      },
    };

    const customPersona = {
      ...securityPersona,
      model: "claude-opus-4-6",
    };

    await reviewWithPersonas(
      client,
      "diff content",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
      [customPersona, architecturePersona],
    );

    expect(capturedModels).toContain("claude-opus-4-6");
    expect(capturedModels).toContain("claude-sonnet-4-6");
  });
});

describe("parseFindings — confidence", () => {
  it("includes confidence from model response", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        description: "Missing null check",
        suggestion: "Add null check",
        confidence: 85,
      },
    ];
    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].confidence).toBe(85);
  });

  it("defaults confidence to 70 when missing", async () => {
    const findings = [
      {
        severity: "medium",
        category: "bug",
        path: "src/foo.ts",
        description: "Issue found",
        suggestion: "Fix it",
      },
    ];
    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].confidence).toBe(70);
  });

  it("clamps confidence above 100 to 100", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        description: "Very confident",
        suggestion: "Fix it",
        confidence: 150,
      },
    ];
    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].confidence).toBe(100);
  });

  it("clamps negative confidence to 0", async () => {
    const findings = [
      {
        severity: "high",
        category: "bug",
        path: "src/foo.ts",
        description: "Negative confidence",
        suggestion: "Fix it",
        confidence: -10,
      },
    ];
    const client = makeClient(JSON.stringify(findings));
    const result = await reviewDiff(
      client,
      "diff",
      files,
      context,
      SESSION_ID,
      "claude-sonnet-4-6",
    );
    expect(result.findings[0].confidence).toBe(0);
  });
});

describe("filterByConfidence", () => {
  const makeFinding = (
    severity: "critical" | "high" | "medium" | "low",
    confidence: number,
  ): import("./types.js").ReviewFinding => ({
    id: "test",
    sessionId: "test",
    severity,
    category: "bug",
    path: "src/foo.ts",
    description: "Test",
    suggestion: "Fix",
    confidence,
  });

  it("passes critical finding at threshold", () => {
    const result = filterByConfidence([makeFinding("critical", 50)]);
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);
  });

  it("filters critical finding below threshold", () => {
    const result = filterByConfidence([makeFinding("critical", 49)]);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
  });

  it("passes high finding at threshold", () => {
    const result = filterByConfidence([makeFinding("high", 60)]);
    expect(result.findings).toHaveLength(1);
  });

  it("filters high finding below threshold", () => {
    const result = filterByConfidence([makeFinding("high", 59)]);
    expect(result.findings).toHaveLength(0);
  });

  it("filters medium finding at 60 (below 70 threshold)", () => {
    const result = filterByConfidence([makeFinding("medium", 60)]);
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
  });

  it("passes medium finding at 75", () => {
    const result = filterByConfidence([makeFinding("medium", 75)]);
    expect(result.findings).toHaveLength(1);
  });

  it("filters low finding at 75 (below 80 threshold)", () => {
    const result = filterByConfidence([makeFinding("low", 75)]);
    expect(result.findings).toHaveLength(0);
  });

  it("passes low finding at 80", () => {
    const result = filterByConfidence([makeFinding("low", 80)]);
    expect(result.findings).toHaveLength(1);
  });

  it("supports custom thresholds", () => {
    const result = filterByConfidence([makeFinding("medium", 50)], {
      critical: 30,
      high: 40,
      medium: 50,
      low: 60,
    });
    expect(result.findings).toHaveLength(1);
  });
});

describe("escalateThresholds", () => {
  it("returns base thresholds for round 1", () => {
    const result = escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, 1);
    expect(result).toEqual(DEFAULT_CONFIDENCE_THRESHOLDS);
  });

  it("raises thresholds by rate per round after round 1", () => {
    const result = escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, 3, 5);
    // Round 3 = 2 rounds past round 1, so +10 per severity
    expect(result.critical).toBe(60);
    expect(result.high).toBe(70);
    expect(result.medium).toBe(80);
    expect(result.low).toBe(90);
  });

  it("caps thresholds at the cap value", () => {
    const result = escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, 10, 5, 90);
    // Round 10 = 9 * 5 = +45, but capped at 90
    expect(result.critical).toBe(90);
    expect(result.high).toBe(90);
    expect(result.medium).toBe(90);
    expect(result.low).toBe(90);
  });

  it("uses default rate of 5 when not specified", () => {
    const result = escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, 2);
    // Round 2 = 1 round past round 1, so +5
    expect(result.critical).toBe(55);
    expect(result.high).toBe(65);
    expect(result.medium).toBe(75);
    expect(result.low).toBe(85);
  });

  it("uses default cap of 95 when not specified", () => {
    const result = escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, 20);
    // Round 20 = 19 * 5 = +95, but low starts at 80 + 95 = 175 → capped at 95
    expect(result.low).toBe(95);
  });

  it("does not modify the original thresholds object", () => {
    const original = { ...DEFAULT_CONFIDENCE_THRESHOLDS };
    escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, 5, 10);
    expect(DEFAULT_CONFIDENCE_THRESHOLDS).toEqual(original);
  });
});
