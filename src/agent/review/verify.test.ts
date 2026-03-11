import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ReviewFinding } from "./types.js";
import {
  gatherFileContents,
  parseVerificationResponse,
  verifyFindings,
} from "./verify.js";
import type { ModelClient } from "../model/client.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: randomUUID(),
  sessionId: "test-session",
  severity: "high",
  category: "bug",
  path: "src/foo.ts",
  description: "Null reference possible",
  suggestion: "Add a null check",
  confidence: 80,
  ...overrides,
});

const makeTmpDir = (): string => {
  const dir = join(tmpdir(), `telesis-verify-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

describe("gatherFileContents", () => {
  it("reads files referenced by findings", () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/foo.ts"), "const x = 1;\n");

    const findings = [makeFinding({ path: "src/foo.ts" })];
    const contents = gatherFileContents(dir, findings);

    expect(contents.size).toBe(1);
    expect(contents.get("src/foo.ts")).toBe("const x = 1;\n");

    rmSync(dir, { recursive: true });
  });

  it("deduplicates file paths across findings", () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/foo.ts"), "content");

    const findings = [
      makeFinding({ path: "src/foo.ts" }),
      makeFinding({ path: "src/foo.ts", description: "Different finding" }),
    ];
    const contents = gatherFileContents(dir, findings);

    expect(contents.size).toBe(1);

    rmSync(dir, { recursive: true });
  });

  it("skips files that cannot be read", () => {
    const dir = makeTmpDir();
    const findings = [makeFinding({ path: "nonexistent/file.ts" })];
    const contents = gatherFileContents(dir, findings);

    expect(contents.size).toBe(0);

    rmSync(dir, { recursive: true });
  });

  it("reads multiple distinct files", () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/a.ts"), "a");
    writeFileSync(join(dir, "src/b.ts"), "b");

    const findings = [
      makeFinding({ path: "src/a.ts" }),
      makeFinding({ path: "src/b.ts" }),
    ];
    const contents = gatherFileContents(dir, findings);

    expect(contents.size).toBe(2);
    expect(contents.get("src/a.ts")).toBe("a");
    expect(contents.get("src/b.ts")).toBe("b");

    rmSync(dir, { recursive: true });
  });
});

describe("parseVerificationResponse", () => {
  it("parses valid verification entries", () => {
    const json = JSON.stringify([
      {
        index: 0,
        verified: true,
        confidence: 90,
        evidence: "Line 42 confirms the null deref.",
      },
      {
        index: 1,
        verified: false,
        confidence: 85,
        evidence: "The import exists on line 3.",
      },
    ]);

    const entries = parseVerificationResponse(json);
    expect(entries).toHaveLength(2);
    expect(entries[0].verified).toBe(true);
    expect(entries[0].confidence).toBe(90);
    expect(entries[1].verified).toBe(false);
  });

  it("filters out malformed entries", () => {
    const json = JSON.stringify([
      {
        index: 0,
        verified: true,
        confidence: 90,
        evidence: "Valid entry",
      },
      { index: 1, verified: "maybe", confidence: 50, evidence: "Bad type" },
      { index: 2, verified: true },
    ]);

    const entries = parseVerificationResponse(json);
    expect(entries).toHaveLength(1);
    expect(entries[0].index).toBe(0);
  });

  it("returns empty array for non-array response", () => {
    const entries = parseVerificationResponse('{"result": "not an array"}');
    expect(entries).toHaveLength(0);
  });

  it("handles JSON in code fences", () => {
    const content = `\`\`\`json
[{"index": 0, "verified": true, "confidence": 95, "evidence": "Confirmed."}]
\`\`\``;

    const entries = parseVerificationResponse(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].verified).toBe(true);
  });
});

describe("verifyFindings", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/foo.ts"), "const x = null;\nconst y = x.z;\n");
  });

  const makeClient = (responseContent: string): ModelClient => ({
    complete: vi.fn().mockResolvedValue({
      content: responseContent,
      usage: { inputTokens: 500, outputTokens: 200 },
      durationMs: 1000,
    }),
    completeStream: vi.fn(),
  });

  it("filters out unverified findings", async () => {
    const findings = [
      makeFinding({ path: "src/foo.ts", description: "Real bug" }),
      makeFinding({ path: "src/foo.ts", description: "False positive" }),
    ];

    const client = makeClient(
      JSON.stringify([
        {
          index: 0,
          verified: true,
          confidence: 90,
          evidence: "Confirmed null deref on line 2.",
        },
        {
          index: 1,
          verified: false,
          confidence: 85,
          evidence: "The variable is actually initialized.",
        },
      ]),
    );

    const result = await verifyFindings(client, "test-model", dir, findings);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toBe("Real bug");
    expect(result.filteredCount).toBe(1);
    expect(result.tokenUsage).toBeDefined();

    rmSync(dir, { recursive: true });
  });

  it("updates confidence from verifier assessment", async () => {
    const findings = [makeFinding({ path: "src/foo.ts", confidence: 70 })];

    const client = makeClient(
      JSON.stringify([
        {
          index: 0,
          verified: true,
          confidence: 95,
          evidence: "Confirmed.",
        },
      ]),
    );

    const result = await verifyFindings(client, "test-model", dir, findings);

    expect(result.findings[0].confidence).toBe(95);

    rmSync(dir, { recursive: true });
  });

  it("keeps findings when verifier omits them (conservative)", async () => {
    const findings = [
      makeFinding({ path: "src/foo.ts", description: "Finding 1" }),
      makeFinding({ path: "src/foo.ts", description: "Finding 2" }),
    ];

    // Verifier only returns result for index 0
    const client = makeClient(
      JSON.stringify([
        {
          index: 0,
          verified: true,
          confidence: 90,
          evidence: "Confirmed.",
        },
      ]),
    );

    const result = await verifyFindings(client, "test-model", dir, findings);

    // Both should be kept — finding 1 verified, finding 2 kept conservatively
    expect(result.findings).toHaveLength(2);

    rmSync(dir, { recursive: true });
  });

  it("returns all findings when no files can be read", async () => {
    const emptyDir = makeTmpDir();
    const findings = [makeFinding({ path: "nonexistent/file.ts" })];
    const client = makeClient("[]");

    const result = await verifyFindings(
      client,
      "test-model",
      emptyDir,
      findings,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);

    rmSync(emptyDir, { recursive: true });
  });

  it("returns all findings on LLM failure (graceful degradation)", async () => {
    const findings = [makeFinding({ path: "src/foo.ts" })];
    const client: ModelClient = {
      complete: vi.fn().mockRejectedValue(new Error("API error")),
      completeStream: vi.fn(),
    };

    const result = await verifyFindings(client, "test-model", dir, findings);

    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);

    rmSync(dir, { recursive: true });
  });

  it("returns empty result for empty findings", async () => {
    const client = makeClient("[]");
    const result = await verifyFindings(client, "test-model", dir, []);

    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(0);
    expect(result.tokenUsage).toBeUndefined();

    rmSync(dir, { recursive: true });
  });

  it("clamps out-of-range confidence from verifier", async () => {
    const findings = [makeFinding({ path: "src/foo.ts" })];

    const client = makeClient(
      JSON.stringify([
        {
          index: 0,
          verified: true,
          confidence: 150,
          evidence: "Very confident.",
        },
      ]),
    );

    const result = await verifyFindings(client, "test-model", dir, findings);

    expect(result.findings[0].confidence).toBe(100);

    rmSync(dir, { recursive: true });
  });
});
