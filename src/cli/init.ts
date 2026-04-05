import { createInterface } from "node:readline";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
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
import { save as saveConfig } from "../config/config.js";
import { runUnifiedInit } from "../scaffold/unified-init.js";
import { applyUpgrade } from "../scaffold/upgrade.js";
import { installHook } from "../hooks/install.js";
import { findGitRoot } from "../hooks/git-root.js";
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

const scaffoldDirectories = (rootDir: string): void => {
  for (const dir of ["docs/adr", "docs/tdd", "docs/context"]) {
    mkdirSync(join(rootDir, dir), { recursive: true });
  }
};

export const initCommand = new Command("init")
  .description(
    "Initialize telesis — auto-detects greenfield, existing docs, or version migration",
  )
  .option("--docs <path>", "Custom docs directory (default: docs)")
  .action(
    handleAction(async (opts: { docs?: string }) => {
      const rootDir = process.cwd();
      const docsDir = opts.docs;

      console.log("\ntelesis init\n");

      const io = createTerminalIO();

      try {
        const result = await runUnifiedInit({
          rootDir,
          docsDir,

          runGreenfield: async () => {
            if (!process.env.ANTHROPIC_API_KEY) {
              throw new Error(
                "ANTHROPIC_API_KEY environment variable is not set. " +
                  "Set it to your Anthropic API key before running telesis init.",
              );
            }

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

            const deps: InitDeps = {
              rootDir,
              interviewClient,
              generateClient,
              configClient,
              runInterview: (o) => runInterview({ ...o, io, maxTurns: 20 }),
              generateDocuments,
              extractConfig,
              generateContext: generate,
              onDocGenerated: (docType) => {
                console.log(`  ✓ ${DOCUMENT_LABELS[docType]}`);
              },
            };

            const initResult = await runInit(deps);
            console.log(`  ✓ CLAUDE.md`);
            console.log(
              `\nInitialized ${initResult.config.project.name} — ` +
                `${initResult.documentsGenerated.length} documents generated ` +
                `from ${initResult.turnCount} interview turn${initResult.turnCount === 1 ? "" : "s"}.`,
            );
            return initResult;
          },

          applyMigration: (dir) => applyUpgrade(dir),

          extractConfigFromDocs: async (_dir, _docsPath) => {
            // Minimal config from directory name.
            // Future: LLM extraction from existing doc content.
            const rawName = rootDir.split("/").pop() ?? "project";
            const name =
              rawName
                .replace(/[^\w\s-]/g, "")
                .trim()
                .slice(0, 128) || "project";
            return {
              project: {
                name,
                owner: "",
                language: "",
                languages: [],
                status: "active" as const,
                repo: "",
              },
            };
          },

          saveConfig: (dir, config) => saveConfig(dir, config),
          generateContext: (dir) => generate(dir),
          scaffoldDirectories,

          installProviderAdapter: (dir, hasClaudeDir) => {
            // Generic adapter for all providers — git hooks
            const gitRoot = findGitRoot(dir);
            if (gitRoot) {
              try {
                installHook(dir, gitRoot);
                console.log("  Installed git pre-commit hook");
              } catch (err) {
                console.log(
                  `  Warning: could not install git pre-commit hook: ${err instanceof Error ? err.message : err}`,
                );
              }
            }

            if (hasClaudeDir) {
              // Claude Code adapter — install skills/hooks/MCP config.
              // applyUpgrade is idempotent — safe even if migration already ran.
              const upgradeResult = applyUpgrade(dir);
              if (upgradeResult.added.length > 0) {
                console.log(
                  `  Installed ${upgradeResult.added.length} Claude Code artifact(s)`,
                );
              }
            }
          },
        });

        console.log(`\nMode: ${result.mode}`);
        if (result.existingDocs.length > 0) {
          console.log(`Found: ${result.existingDocs.join(", ")}`);
        }
        if (result.missingDocs.length > 0) {
          console.log(`Missing: ${result.missingDocs.join(", ")}`);
        }
        if (result.migrationResult) {
          const { added, alreadyPresent } = result.migrationResult;
          if (added.length > 0) {
            console.log(`Added ${added.length} artifact(s)`);
          }
          if (alreadyPresent.length > 0) {
            console.log(`${alreadyPresent.length} artifact(s) already present`);
          }
        }
      } finally {
        io.close();
      }
    }),
  );
