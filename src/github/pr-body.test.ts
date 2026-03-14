import { describe, it, expect, vi } from "vitest";
import { generatePRBody, generateLLMPRBody } from "./pr-body.js";
import type { Plan } from "../plan/types.js";
import type { WorkItem } from "../intake/types.js";
import type { RunResult } from "../pipeline/types.js";
import type { ModelClient } from "../agent/model/client.js";

const makePlan = (overrides?: Partial<Plan>): Plan => ({
  id: "plan-001-uuid-full-length-here-1234",
  workItemId: "wi-001-uuid-full-length-here-12345",
  title: "Implement user authentication",
  status: "completed",
  tasks: [
    {
      id: "task-1",
      title: "Add login endpoint",
      description: "Create POST /login",
      dependsOn: [],
      status: "completed",
    },
    {
      id: "task-2",
      title: "Add auth middleware",
      description: "JWT verification middleware",
      dependsOn: ["task-1"],
      status: "completed",
    },
  ],
  createdAt: "2026-03-13T00:00:00Z",
  ...overrides,
});

const makeWorkItem = (overrides?: Partial<WorkItem>): WorkItem => ({
  id: "wi-001-uuid-full-length-here-12345",
  source: "github",
  sourceId: "42",
  sourceUrl: "https://github.com/owner/repo/issues/42",
  title: "Add user authentication",
  body: "We need login/logout functionality",
  labels: ["feature"],
  status: "pending",
  importedAt: "2026-03-13T00:00:00Z",
  ...overrides,
});

const makeResult = (overrides?: Partial<RunResult>): RunResult => ({
  workItemId: "wi-001-uuid-full-length-here-12345",
  planId: "plan-001-uuid-full-length-here-1234",
  stage: "completed",
  durationMs: 10_000,
  ...overrides,
});

const makeMockClient = (response: string): ModelClient => ({
  complete: vi.fn(async () => ({
    content: response,
    usage: { inputTokens: 200, outputTokens: 100 },
    durationMs: 1000,
  })),
  completeStream: vi.fn(),
});

describe("generatePRBody", () => {
  it("includes issue reference and task list", () => {
    const body = generatePRBody(makePlan(), makeWorkItem(), makeResult());

    expect(body).toContain("Resolves #42");
    expect(body).toContain("Add login endpoint");
    expect(body).toContain("Add auth middleware");
    expect(body).toContain("Tasks: 2");
    expect(body).not.toContain("Work item:");
  });

  it("uses work item ID for non-GitHub sources", () => {
    const workItem = {
      ...makeWorkItem(),
      source: "manual",
    } as unknown as WorkItem;

    const body = generatePRBody(makePlan(), workItem, makeResult());

    expect(body).not.toContain("Resolves");
    expect(body).toContain("Work item: wi-001-u");
  });

  it("includes quality gate summary when present", () => {
    const result = makeResult({
      qualityGateSummary: {
        ran: true,
        passed: true,
        results: [
          { gate: "lint", passed: true, durationMs: 1000 },
          { gate: "test", passed: true, durationMs: 5000 },
        ],
      },
    });

    const body = generatePRBody(makePlan(), makeWorkItem(), result);

    expect(body).toContain("Quality gates: 2/2 passed");
  });

  it("includes review summary when present", () => {
    const result = makeResult({
      reviewSummary: {
        ran: true,
        passed: true,
        totalFindings: 3,
        blockingFindings: 0,
        threshold: "high",
        findings: [],
      },
    });

    const body = generatePRBody(makePlan(), makeWorkItem(), result);

    expect(body).toContain("Review: passed");
    expect(body).toContain("3 findings");
  });

  it("uses checkbox format for tasks", () => {
    const body = generatePRBody(makePlan(), makeWorkItem(), makeResult());

    expect(body).toContain("- [x] Add login endpoint");
    expect(body).toContain("- [x] Add auth middleware");
  });
});

describe("generateLLMPRBody", () => {
  it("returns LLM-generated body on success", async () => {
    const client = makeMockClient(
      "## Summary\nAdds user authentication with JWT.\n\n## Changes\n- Added login endpoint\n- Added auth middleware",
    );

    const body = await generateLLMPRBody(
      client,
      "diff content",
      makePlan(),
      makeWorkItem(),
      makeResult(),
    );

    expect(body).toContain("Summary");
    expect(body).toContain("auth");
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it("falls back to deterministic body on LLM failure", async () => {
    const client: ModelClient = {
      complete: vi.fn(async () => {
        throw new Error("API error");
      }),
      completeStream: vi.fn(),
    };

    const body = await generateLLMPRBody(
      client,
      "diff",
      makePlan(),
      makeWorkItem(),
      makeResult(),
    );

    expect(body).toContain("Resolves #42");
    expect(body).toContain("Add login endpoint");
  });

  it("falls back to deterministic body on empty response", async () => {
    const client = makeMockClient("");

    const body = await generateLLMPRBody(
      client,
      "diff",
      makePlan(),
      makeWorkItem(),
      makeResult(),
    );

    expect(body).toContain("Resolves #42");
  });

  it("truncates large diffs", async () => {
    const client = makeMockClient("## Summary\nLarge change.");
    const largeDiff = "y".repeat(40_000);

    await generateLLMPRBody(
      client,
      largeDiff,
      makePlan(),
      makeWorkItem(),
      makeResult(),
    );

    const callArgs = vi.mocked(client.complete).mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage.length).toBeLessThan(35_000);
    expect(userMessage).toContain("[diff truncated");
  });

  it("includes quality gate results in prompt when present", async () => {
    const client = makeMockClient("## Summary\nWith gates.");
    const result = makeResult({
      qualityGateSummary: {
        ran: true,
        passed: true,
        results: [{ gate: "lint", passed: true, durationMs: 1000 }],
      },
    });

    await generateLLMPRBody(client, "diff", makePlan(), makeWorkItem(), result);

    const callArgs = vi.mocked(client.complete).mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage).toContain("Quality Gates");
    expect(userMessage).toContain("lint");
  });

  it("passes system prompt and uses bounded maxTokens", async () => {
    const client = makeMockClient("## Summary\nTest.");

    await generateLLMPRBody(
      client,
      "diff",
      makePlan(),
      makeWorkItem(),
      makeResult(),
    );

    const callArgs = vi.mocked(client.complete).mock.calls[0][0];
    expect(callArgs.system).toContain("pull request");
    expect(callArgs.maxTokens).toBe(1024);
  });
});
