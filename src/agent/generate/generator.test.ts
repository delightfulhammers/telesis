import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateDocuments } from "./generator.js";
import type { GenerateOptions } from "./generator.js";
import type { ModelClient } from "../model/client.js";
import type { InterviewState } from "../interview/state.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { DocumentType } from "./types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("generator-test");

const makeState = (): InterviewState => ({
  sessionId: "test-session",
  turns: [
    { role: "assistant", content: "What are you building?" },
    { role: "user", content: "A project management CLI." },
  ],
  complete: true,
  turnCount: 1,
});

const makeResponse = (content: string): CompletionResponse => ({
  content,
  usage: { inputTokens: 100, outputTokens: 50 },
  durationMs: 500,
});

const makeMockClient = (responses: Record<string, string>): ModelClient => ({
  complete: vi.fn(async (request: CompletionRequest) => {
    const docType = request.messages[0].content
      .match(/Generate the (\w+) document/)?.[1]
      ?.toLowerCase();
    return makeResponse(responses[docType ?? ""] ?? "# Default");
  }),
  completeStream: vi.fn(),
});

describe("generateDocuments", () => {
  it("generates all four documents in order", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# Vision\n\nThe vision.",
      prd: "# PRD\n\nThe requirements.",
      architecture: "# Architecture\n\nThe design.",
      milestones: "# Milestones\n\nThe roadmap.",
    });

    const docs = await generateDocuments({
      client,
      state: makeState(),
      rootDir,
    });

    expect(docs.vision).toContain("The vision.");
    expect(docs.prd).toContain("The requirements.");
    expect(docs.architecture).toContain("The design.");
    expect(docs.milestones).toContain("The roadmap.");
  });

  it("writes documents to the filesystem", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# Vision",
      prd: "# PRD",
      architecture: "# Architecture",
      milestones: "# Milestones",
    });

    await generateDocuments({ client, state: makeState(), rootDir });

    expect(readFileSync(join(rootDir, "docs/VISION.md"), "utf-8")).toContain(
      "# Vision",
    );
    expect(readFileSync(join(rootDir, "docs/PRD.md"), "utf-8")).toContain(
      "# PRD",
    );
    expect(
      readFileSync(join(rootDir, "docs/ARCHITECTURE.md"), "utf-8"),
    ).toContain("# Architecture");
    expect(
      readFileSync(join(rootDir, "docs/MILESTONES.md"), "utf-8"),
    ).toContain("# Milestones");
  });

  it("appends trailing newline to written files", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# Vision",
      prd: "# PRD",
      architecture: "# Arch",
      milestones: "# Miles",
    });

    await generateDocuments({ client, state: makeState(), rootDir });

    const content = readFileSync(join(rootDir, "docs/VISION.md"), "utf-8");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("calls model with system prompt containing interview context", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# V",
      prd: "# P",
      architecture: "# A",
      milestones: "# M",
    });

    await generateDocuments({ client, state: makeState(), rootDir });

    const calls = (client.complete as ReturnType<typeof vi.fn>).mock.calls;
    const firstCall = calls[0][0] as CompletionRequest;
    expect(firstCall.system).toContain("VISION.md");
    expect(firstCall.system).toContain("project management CLI");
  });

  it("passes previously generated docs as context to later generations", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# Vision\n\nCore vision content.",
      prd: "# PRD",
      architecture: "# Architecture",
      milestones: "# Milestones",
    });

    await generateDocuments({ client, state: makeState(), rootDir });

    const calls = (client.complete as ReturnType<typeof vi.fn>).mock.calls;

    // First call (vision) should NOT have previous docs
    const visionPrompt = (calls[0][0] as CompletionRequest).system!;
    expect(visionPrompt).not.toContain("Previously generated:");

    // Second call (prd) should have vision
    const prdPrompt = (calls[1][0] as CompletionRequest).system!;
    expect(prdPrompt).toContain("Previously generated: VISION.md");
    expect(prdPrompt).toContain("Core vision content.");

    // Fourth call (milestones) should have all three
    const milestonesPrompt = (calls[3][0] as CompletionRequest).system!;
    expect(milestonesPrompt).toContain("Previously generated: VISION.md");
    expect(milestonesPrompt).toContain("Previously generated: PRD.md");
    expect(milestonesPrompt).toContain("Previously generated: ARCHITECTURE.md");
  });

  it("calls onDocGenerated callback for each document", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# V",
      prd: "# P",
      architecture: "# A",
      milestones: "# M",
    });
    const generated: Array<[DocumentType, string]> = [];

    await generateDocuments({
      client,
      state: makeState(),
      rootDir,
      onDocGenerated: (docType, content) => generated.push([docType, content]),
    });

    expect(generated).toHaveLength(4);
    expect(generated[0][0]).toBe("vision");
    expect(generated[1][0]).toBe("prd");
    expect(generated[2][0]).toBe("architecture");
    expect(generated[3][0]).toBe("milestones");
  });

  it("creates docs directory if it does not exist", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# V",
      prd: "# P",
      architecture: "# A",
      milestones: "# M",
    });

    await generateDocuments({ client, state: makeState(), rootDir });

    // Verify files exist (docs/ was created)
    expect(readFileSync(join(rootDir, "docs/VISION.md"), "utf-8")).toBeTruthy();
  });

  it("makes exactly 4 model calls", async () => {
    const rootDir = makeTempDir();
    const client = makeMockClient({
      vision: "# V",
      prd: "# P",
      architecture: "# A",
      milestones: "# M",
    });

    await generateDocuments({ client, state: makeState(), rootDir });

    expect(client.complete).toHaveBeenCalledTimes(4);
  });
});
