import { describe, it, expect, vi } from "vitest";
import {
  generateCommitMessage,
  generateLLMCommitMessage,
} from "./commit-message.js";
import type { Plan } from "../plan/types.js";
import type { WorkItem } from "../intake/types.js";
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

const makeMockClient = (response: string): ModelClient => ({
  complete: vi.fn(async () => ({
    content: response,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 500,
  })),
  completeStream: vi.fn(),
});

describe("generateCommitMessage", () => {
  it("generates conventional commit with issue reference", () => {
    const message = generateCommitMessage(makePlan(), makeWorkItem());

    expect(message).toContain("feat: Add user authentication (#42)");
    expect(message).toContain("Plan: Implement user authentication");
    expect(message).toContain("Work item: wi-001-u");
    expect(message).toContain("Tasks: 2");
  });

  it("omits issue reference for non-github sources", () => {
    const workItem = makeWorkItem({
      source: "github" as const,
      sourceId: "",
    });
    // Simulate a non-github source by casting
    const nonGh = { ...workItem, source: "manual" } as unknown as WorkItem;

    const message = generateCommitMessage(makePlan(), nonGh);

    expect(message).toContain("feat: Add user authentication");
    expect(message).not.toContain("#");
  });

  it("includes plan title and task count", () => {
    const plan = makePlan({ title: "My custom plan title" });
    const message = generateCommitMessage(plan, makeWorkItem());

    expect(message).toContain("Plan: My custom plan title");
  });

  it("handles single task", () => {
    const plan = makePlan({
      tasks: [
        {
          id: "task-1",
          title: "Single task",
          description: "Only one",
          dependsOn: [],
          status: "completed",
        },
      ],
    });
    const message = generateCommitMessage(plan, makeWorkItem());

    expect(message).toContain("Tasks: 1");
  });
});

describe("generateLLMCommitMessage", () => {
  it("returns LLM-generated message on success", async () => {
    const client = makeMockClient(
      "feat: add user authentication (#42)\n\n- Add login endpoint with JWT support\n- Add auth middleware for protected routes",
    );
    const diff =
      "diff --git a/src/auth.ts b/src/auth.ts\n+export const login = () => {};";

    const message = await generateLLMCommitMessage(
      client,
      diff,
      makePlan(),
      makeWorkItem(),
    );

    expect(message).toContain("feat: add user authentication (#42)");
    expect(message).toContain("login endpoint");
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it("falls back to deterministic message on LLM failure", async () => {
    const client: ModelClient = {
      complete: vi.fn(async () => {
        throw new Error("API timeout");
      }),
      completeStream: vi.fn(),
    };

    const message = await generateLLMCommitMessage(
      client,
      "some diff",
      makePlan(),
      makeWorkItem(),
    );

    expect(message).toContain("feat: Add user authentication (#42)");
    expect(message).toContain("Plan:");
  });

  it("falls back to deterministic message on empty response", async () => {
    const client = makeMockClient("");

    const message = await generateLLMCommitMessage(
      client,
      "some diff",
      makePlan(),
      makeWorkItem(),
    );

    expect(message).toContain("feat: Add user authentication (#42)");
  });

  it("truncates large diffs to bound token usage", async () => {
    const client = makeMockClient("feat: large change (#42)");
    const largeDiff = "x".repeat(30_000);

    await generateLLMCommitMessage(
      client,
      largeDiff,
      makePlan(),
      makeWorkItem(),
    );

    const callArgs = vi.mocked(client.complete).mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    // MAX_DIFF_CHARS (20k) + prompt overhead (~500 chars) should stay under 22k
    expect(userMessage.length).toBeLessThan(22_000);
    expect(userMessage).toContain("[diff truncated");
  });

  it("passes system prompt and uses low maxTokens", async () => {
    const client = makeMockClient("feat: test (#42)");

    await generateLLMCommitMessage(client, "diff", makePlan(), makeWorkItem());

    const callArgs = vi.mocked(client.complete).mock.calls[0][0];
    expect(callArgs.system).toContain("conventional commit");
    expect(callArgs.maxTokens).toBe(512);
  });
});
