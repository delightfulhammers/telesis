import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { handleAction } from "./handle-action.js";
import { runInit } from "../agent/init/orchestrator.js";
import type { InitDeps } from "../agent/init/orchestrator.js";
import { createModelClient, createSdk } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { runInterview } from "../agent/interview/engine.js";
import type { InterviewIO } from "../agent/interview/engine.js";
import { generateDocuments } from "../agent/generate/generator.js";
import { extractConfig } from "../agent/init/config-extract.js";
import { generate } from "../context/context.js";
import type { DocumentType } from "../agent/generate/types.js";

const DOCUMENT_LABELS: Readonly<Record<DocumentType, string>> = {
  vision: "VISION.md",
  prd: "PRD.md",
  architecture: "ARCHITECTURE.md",
  milestones: "MILESTONES.md",
};

const createTerminalIO = (): InterviewIO & { close: () => void } => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const readInput = (): Promise<string> =>
    new Promise((resolve) => {
      rl.question("\n> ", (answer) => resolve(answer));
    });

  const writeOutput = (text: string): void => {
    process.stdout.write(text);
  };

  return { readInput, writeOutput, close: () => rl.close() };
};

export const initCommand = new Command("init")
  .description("Initialize a new Telesis project with AI-powered interview")
  .action(
    handleAction(async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY environment variable is not set. " +
            "Set it to your Anthropic API key before running telesis init.",
        );
      }

      const rootDir = process.cwd();
      const sessionId = randomUUID();
      const telemetry = createTelemetryLogger(rootDir);
      const sdk = createSdk();

      const interviewClient = createModelClient({
        sdk,
        telemetry,
        sessionId,
        component: "interview",
      });

      const generateClient = createModelClient({
        sdk,
        telemetry,
        sessionId,
        component: "generate",
      });

      const configClient = createModelClient({
        sdk,
        telemetry,
        sessionId,
        component: "config-extract",
      });

      const io = createTerminalIO();

      const deps: InitDeps = {
        rootDir,
        interviewClient,
        generateClient,
        configClient,
        runInterview: (opts) => runInterview({ ...opts, io, maxTurns: 20 }),
        generateDocuments,
        extractConfig,
        generateContext: generate,
        onDocGenerated: (docType) => {
          console.log(`  ✓ ${DOCUMENT_LABELS[docType]}`);
        },
      };

      try {
        console.log("\ntelesis init\n");

        const result = await runInit(deps);

        console.log(`  ✓ CLAUDE.md`);
        console.log(
          `\nInitialized ${result.config.project.name} — ` +
            `${result.documentsGenerated.length} documents generated ` +
            `from ${result.turnCount} interview turn${result.turnCount === 1 ? "" : "s"}.`,
        );
      } finally {
        io.close();
      }
    }),
  );
