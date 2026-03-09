import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ModelClient } from "../model/client.js";
import type { InterviewState } from "../interview/state.js";
import type { InterviewOptions } from "../interview/engine.js";
import type { GenerateOptions } from "../generate/generator.js";
import type { DocumentType, GeneratedDocs } from "../generate/types.js";
import type { Config } from "../../config/config.js";
import { save as saveConfig } from "../../config/config.js";
import { bootstrapPricing } from "../telemetry/pricing.js";

const README_STUBS: Readonly<Record<string, string>> = {
  "docs/adr/README.md":
    "# Architectural Decision Records (ADRs)\n\nThis directory contains ADR files created by `telesis adr new <slug>`.\n\nEach ADR captures a significant architectural decision with its context, rationale, and consequences.\n",
  "docs/tdd/README.md":
    "# Technical Design Documents (TDDs)\n\nThis directory contains TDD files created by `telesis tdd new <slug>`.\n\nEach TDD details the design of a specific component or subsystem.\n",
};

export interface InitDeps {
  readonly rootDir: string;
  readonly interviewClient: ModelClient;
  readonly generateClient: ModelClient;
  readonly configClient: ModelClient;
  readonly runInterview: (
    options: Pick<InterviewOptions, "client" | "rootDir" | "sessionId">,
  ) => Promise<InterviewState>;
  readonly generateDocuments: (
    options: GenerateOptions,
  ) => Promise<GeneratedDocs>;
  readonly extractConfig: (
    client: ModelClient,
    state: InterviewState,
  ) => Promise<Config>;
  readonly generateContext: (rootDir: string) => string;
  readonly onDocGenerated?: (docType: DocumentType, content: string) => void;
}

export interface InitResult {
  readonly turnCount: number;
  readonly documentsGenerated: readonly DocumentType[];
  readonly config: Config;
}

const createDirectories = (rootDir: string): void => {
  const dirs = [
    join(rootDir, "docs", "adr"),
    join(rootDir, "docs", "tdd"),
    join(rootDir, "docs", "context"),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
};

const writeReadmeStubs = (rootDir: string): void => {
  for (const [relPath, content] of Object.entries(README_STUBS)) {
    const dest = join(rootDir, relPath);
    writeFileSync(dest, content);
  }
};

const writeClaudeMd = (rootDir: string, content: string): void => {
  writeFileSync(join(rootDir, "CLAUDE.md"), content);
};

export const runInit = async (deps: InitDeps): Promise<InitResult> => {
  const {
    rootDir,
    interviewClient,
    generateClient,
    configClient,
    runInterview,
    generateDocuments,
    extractConfig,
    generateContext,
    onDocGenerated,
  } = deps;

  // Check if already initialized
  if (existsSync(join(rootDir, ".telesis", "config.yml"))) {
    throw new Error(
      "Project already initialized (run `telesis context` to regenerate CLAUDE.md)",
    );
  }

  // Set up directory structure
  createDirectories(rootDir);
  writeReadmeStubs(rootDir);
  bootstrapPricing(rootDir);

  // Run the interview
  const state = await runInterview({
    client: interviewClient,
    rootDir,
    sessionId: "init",
  });

  // Extract config and generate documents concurrently — both depend only
  // on the interview state and write to non-overlapping filesystem paths.
  const documentsGenerated: DocumentType[] = [];
  const [config] = await Promise.all([
    extractConfig(configClient, state).then((cfg) => {
      saveConfig(rootDir, cfg);
      return cfg;
    }),
    generateDocuments({
      client: generateClient,
      state,
      rootDir,
      onDocGenerated: (docType, content) => {
        documentsGenerated.push(docType);
        onDocGenerated?.(docType, content);
      },
    }),
  ]);

  // Generate CLAUDE.md
  const claudeContent = generateContext(rootDir);
  writeClaudeMd(rootDir, claudeContent);

  return {
    turnCount: state.turnCount,
    documentsGenerated,
    config,
  };
};
