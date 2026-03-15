import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse, TokenUsage } from "../agent/model/types.js";
import type { PlanTask } from "../plan/types.js";
import { validateTask } from "./validator.js";

const makeTempDir = useTempDir("validator");

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  writeFileSync(
    join(rootDir, ".telesis", "config.yml"),
    "project:\n  name: test-project\n  owner: test\n  languages:\n  - TypeScript\n  status: active\n  repo: github.com/test/test\n",
  );
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "context"), { recursive: true });
};

const makeTask = (overrides?: Partial<PlanTask>): PlanTask => ({
  id: "task-1",
  title: "Create user validation",
  description: "Add email format validation. Add empty string check.",
  dependsOn: [],
  status: "completed",
  ...overrides,
});

const makeUsage = (): TokenUsage => ({
  inputTokens: 100,
  outputTokens: 50,
});

const makeResponse = (content: string): CompletionResponse => ({
  content,
  usage: makeUsage(),
  durationMs: 500,
});

const makeMockClient = (responseContent: string): ModelClient => ({
  complete: async () => makeResponse(responseContent),
  completeStream: async function* () {
    yield { type: "done" as const, response: makeResponse(responseContent) };
  },
});

describe("validateTask", () => {
  it("returns passing verdict when all criteria met", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const client = makeMockClient(
      JSON.stringify({
        passed: true,
        criteria: [
          {
            criterion: "Email format validation",
            met: true,
            evidence: "Added regex check",
          },
          {
            criterion: "Empty string check",
            met: true,
            evidence: "Added guard clause",
          },
        ],
        summary: "All requirements met",
      }),
    );

    const result = await validateTask(
      client,
      makeTask(),
      "+export const validate = () => {};",
      "Created validation module",
      rootDir,
    );

    expect(result.verdict.passed).toBe(true);
    expect(result.verdict.criteria).toHaveLength(2);
    expect(result.verdict.criteria.every((c) => c.met)).toBe(true);
    expect(result.durationMs).toBe(500);
    expect(result.tokenUsage.inputTokens).toBe(100);
  });

  it("returns failing verdict when criteria not met", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const client = makeMockClient(
      JSON.stringify({
        passed: false,
        criteria: [
          {
            criterion: "Email format validation",
            met: true,
            evidence: "Added regex",
          },
          {
            criterion: "Empty string check",
            met: false,
            evidence: "No guard clause found",
          },
        ],
        summary: "Missing empty string validation",
      }),
    );

    const result = await validateTask(
      client,
      makeTask(),
      "+export const validate = () => {};",
      "Created partial module",
      rootDir,
    );

    expect(result.verdict.passed).toBe(false);
    expect(result.verdict.criteria[1]!.met).toBe(false);
  });

  it("handles passed:true with unmet criteria by overriding to false", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    // LLM says passed but has unmet criteria — normalization should catch this
    const client = makeMockClient(
      JSON.stringify({
        passed: true,
        criteria: [
          { criterion: "Feature A", met: true, evidence: "done" },
          { criterion: "Feature B", met: false, evidence: "missing" },
        ],
        summary: "Mostly done",
      }),
    );

    const result = await validateTask(
      client,
      makeTask(),
      "diff",
      "summary",
      rootDir,
    );

    expect(result.verdict.passed).toBe(false);
  });

  it("handles malformed JSON response gracefully", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const client = makeMockClient("This is not JSON at all");

    await expect(
      validateTask(client, makeTask(), "diff", "summary", rootDir),
    ).rejects.toThrow();
  });

  it("handles response wrapped in code fence", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const client = makeMockClient(
      "```json\n" +
        JSON.stringify({
          passed: true,
          criteria: [{ criterion: "Test", met: true, evidence: "ok" }],
          summary: "Good",
        }) +
        "\n```",
    );

    const result = await validateTask(
      client,
      makeTask(),
      "diff",
      "summary",
      rootDir,
    );

    expect(result.verdict.passed).toBe(true);
  });

  it("normalizes missing criteria fields", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    const client = makeMockClient(
      JSON.stringify({
        passed: true,
        criteria: [
          { criterion: "Test", met: true },
          { met: true, evidence: "ok" },
          "not an object",
        ],
        summary: "Partial",
      }),
    );

    const result = await validateTask(
      client,
      makeTask(),
      "diff",
      "summary",
      rootDir,
    );

    // Only the first criterion should survive normalization (second has no criterion field)
    expect(result.verdict.criteria).toHaveLength(1);
    expect(result.verdict.criteria[0]!.evidence).toBe("");
  });

  it("passes model override to client", async () => {
    const rootDir = makeTempDir();
    setupProject(rootDir);

    let requestedModel: string | undefined;
    const client: ModelClient = {
      complete: async (req) => {
        requestedModel = req.model;
        return makeResponse(
          JSON.stringify({
            passed: true,
            criteria: [{ criterion: "Test", met: true, evidence: "ok" }],
            summary: "ok",
          }),
        );
      },
      completeStream: async function* () {},
    };

    const result = await validateTask(
      client,
      makeTask(),
      "diff",
      "summary",
      rootDir,
      "claude-opus-4-6",
    );

    expect(requestedModel).toBe("claude-opus-4-6");
    expect(result.model).toBe("claude-opus-4-6");
  });
});
