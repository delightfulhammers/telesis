import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runInit } from "./orchestrator.js";
import type { InitDeps } from "./orchestrator.js";
import type { ModelClient } from "../model/client.js";
import type { CompletionRequest, CompletionResponse } from "../model/types.js";
import type { InterviewState } from "../interview/state.js";
import type { DocumentType } from "../generate/types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("orchestrator-test");

const makeResponse = (content: string): CompletionResponse => ({
  content,
  usage: { inputTokens: 100, outputTokens: 50 },
  durationMs: 500,
});

const fakeInterviewState: InterviewState = {
  sessionId: "test-session",
  turns: [
    { role: "assistant", content: "What are you building?" },
    { role: "user", content: "A task management CLI called taskr." },
    {
      role: "assistant",
      content: 'Great! What language? {"interviewComplete": true}',
    },
  ],
  complete: true,
  turnCount: 1,
};

const fakeConfig = {
  name: "taskr",
  owner: "Test User",
  language: "TypeScript",
  repo: "",
};

const makeDeps = (rootDir: string): InitDeps => {
  const interviewClient: ModelClient = {
    complete: vi.fn(),
    completeStream: vi.fn(),
  };

  const generateClient: ModelClient = {
    complete: vi.fn(async (request: CompletionRequest) => {
      const docType = request.messages[0].content
        .match(/Generate the (\w+) document/)?.[1]
        ?.toLowerCase();
      const docs: Record<string, string> = {
        vision: "# Vision\n\nA task management tool.",
        prd: "# PRD\n\nRequirements.",
        architecture: "# Architecture\n\nDesign.",
        milestones: "# Milestones\n\nRoadmap.",
      };
      return makeResponse(docs[docType ?? ""] ?? "# Default");
    }),
    completeStream: vi.fn(),
  };

  const configClient: ModelClient = {
    complete: vi.fn(async () => makeResponse(JSON.stringify(fakeConfig))),
    completeStream: vi.fn(),
  };

  return {
    rootDir,
    runInterview: vi.fn(async () => fakeInterviewState),
    generateDocuments: vi.fn(async (opts) => {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const docs: Record<string, string> = {};
      const order: DocumentType[] = [
        "vision",
        "prd",
        "architecture",
        "milestones",
      ];
      const paths: Record<string, string> = {
        vision: "docs/VISION.md",
        prd: "docs/PRD.md",
        architecture: "docs/ARCHITECTURE.md",
        milestones: "docs/MILESTONES.md",
      };
      for (const dt of order) {
        const content = `# ${dt.charAt(0).toUpperCase() + dt.slice(1)}\n\nGenerated.`;
        docs[dt] = content;
        const filePath = join(opts.rootDir, paths[dt]);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content + "\n");
        opts.onDocGenerated?.(dt, content);
      }
      return docs as {
        vision: string;
        prd: string;
        architecture: string;
        milestones: string;
      };
    }),
    extractConfig: vi.fn(async () => ({
      project: {
        name: fakeConfig.name,
        owner: fakeConfig.owner,
        language: fakeConfig.language,
        status: "active",
        repo: fakeConfig.repo,
      },
    })),
    generateContext: vi.fn(() => "# CLAUDE.md content"),
    interviewClient,
    generateClient,
    configClient,
  };
};

describe("runInit", () => {
  it("runs the full init pipeline", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    const result = await runInit(deps);

    expect(deps.runInterview).toHaveBeenCalledOnce();
    expect(deps.extractConfig).toHaveBeenCalledOnce();
    expect(deps.generateDocuments).toHaveBeenCalledOnce();
    expect(deps.generateContext).toHaveBeenCalledOnce();
    expect(result.turnCount).toBe(1);
    expect(result.documentsGenerated).toHaveLength(4);
  });

  it("writes config.yml", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    expect(existsSync(join(rootDir, ".telesis", "config.yml"))).toBe(true);
    const content = readFileSync(
      join(rootDir, ".telesis", "config.yml"),
      "utf-8",
    );
    expect(content).toContain("taskr");
  });

  it("writes CLAUDE.md", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    expect(existsSync(join(rootDir, "CLAUDE.md"))).toBe(true);
  });

  it("bootstraps pricing.yml", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    expect(existsSync(join(rootDir, ".telesis", "pricing.yml"))).toBe(true);
  });

  it("creates directory structure", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    expect(existsSync(join(rootDir, "docs", "adr"))).toBe(true);
    expect(existsSync(join(rootDir, "docs", "tdd"))).toBe(true);
    expect(existsSync(join(rootDir, "docs", "context"))).toBe(true);
  });

  it("writes README stubs", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    expect(existsSync(join(rootDir, "docs", "adr", "README.md"))).toBe(true);
    expect(existsSync(join(rootDir, "docs", "tdd", "README.md"))).toBe(true);
  });

  it("returns document names in result", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    const result = await runInit(deps);

    expect(result.documentsGenerated).toContain("vision");
    expect(result.documentsGenerated).toContain("prd");
    expect(result.documentsGenerated).toContain("architecture");
    expect(result.documentsGenerated).toContain("milestones");
  });

  it("calls onDocGenerated callback for progress", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);
    const generated: DocumentType[] = [];

    await runInit({
      ...deps,
      onDocGenerated: (docType) => generated.push(docType),
    });

    expect(generated).toHaveLength(4);
  });

  it("throws if project is already initialized", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    // First init succeeds
    await runInit(deps);

    // Second init should fail
    await expect(runInit(deps)).rejects.toThrow("already initialized");
  });

  it("calls extractConfig with interview state", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    expect(deps.extractConfig).toHaveBeenCalledWith(
      deps.configClient,
      fakeInterviewState,
    );
  });

  it("calls generateDocuments with interview state", async () => {
    const rootDir = makeTempDir();
    const deps = makeDeps(rootDir);

    await runInit(deps);

    const call = (deps.generateDocuments as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.state).toBe(fakeInterviewState);
    expect(call.rootDir).toBe(rootDir);
  });
});
