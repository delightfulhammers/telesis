import { Command } from "commander";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import {
  loadRawConfig,
  parseDispatchConfig,
  parsePlannerConfig,
  parseValidationConfig,
  parseGitConfig,
  parsePipelineConfig,
} from "../config/config.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import { createEventRenderer } from "../daemon/tui.js";
import { createSdk, createModelClient } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { runPipeline } from "../pipeline/run.js";
import { formatRunResult } from "../pipeline/format.js";

/** Interactive confirmation via readline */
const createConfirm = (): {
  confirm: (message: string) => Promise<boolean>;
  close: () => void;
} => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const confirm = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      rl.question(`${message} `, (answer) => {
        resolve(answer.trim().toLowerCase().startsWith("y"));
      });
    });

  return { confirm, close: () => rl.close() };
};

export const runCommand = new Command("run")
  .description(
    "Run the full pipeline: plan → execute → validate → commit → push",
  )
  .argument("<work-item-id>", "Work item ID or prefix")
  .option("--agent <name>", "Agent to use (default from config)")
  .option("--auto-approve", "Skip plan confirmation prompt")
  .option("--no-push", "Skip push after commit")
  .option("--no-validate", "Skip validation loop")
  .option("--branch <name>", "Override branch name")
  .action(
    handleAction(
      async (
        workItemId: string,
        opts: {
          agent?: string;
          autoApprove?: boolean;
          push?: boolean;
          validate?: boolean;
          branch?: string;
        },
      ) => {
        const rootDir = projectRoot();
        const rawConfig = loadRawConfig(rootDir);
        const dispatchConfig = parseDispatchConfig(rawConfig);
        const plannerConfig = parsePlannerConfig(rawConfig);
        const validationConfig = parseValidationConfig(rawConfig);
        const gitConfig = parseGitConfig(rawConfig);
        const pipelineConfig = parsePipelineConfig(rawConfig);

        const agent = opts.agent ?? dispatchConfig.defaultAgent ?? "claude";
        const adapter = createAcpxAdapter({
          acpxPath: dispatchConfig.acpxPath,
        });
        const renderer = createEventRenderer();

        const sessionId = randomUUID();
        const telemetry = createTelemetryLogger(rootDir);
        const modelClient = createModelClient({
          sdk: createSdk(),
          telemetry,
          sessionId,
          component: "pipeline",
          defaultModel: plannerConfig.model,
        });

        // Apply CLI overrides
        const effectiveGitConfig = {
          ...gitConfig,
          ...(opts.push === false ? { pushAfterCommit: false } : {}),
        };

        const effectiveValidationConfig =
          opts.validate === false
            ? { ...validationConfig, maxRetries: 0 }
            : validationConfig;

        const effectivePipelineConfig = {
          ...pipelineConfig,
          ...(opts.autoApprove ? { autoApprove: true } : {}),
        };

        // Set up interactive confirm (or auto-approve)
        const { confirm, close } = effectivePipelineConfig.autoApprove
          ? { confirm: async () => true, close: () => {} }
          : createConfirm();

        try {
          const result = await runPipeline(
            {
              rootDir,
              adapter,
              agent,
              modelClient,
              onEvent: renderer,
              gitConfig: effectiveGitConfig,
              pipelineConfig: effectivePipelineConfig,
              validationConfig: effectiveValidationConfig,
              plannerConfig,
              dispatchConfig,
              confirm,
            },
            workItemId,
            opts.branch,
          );

          console.log("");
          console.log(formatRunResult(result));

          if (result.stage === "failed") {
            process.exitCode = 1;
          }
        } finally {
          close();
        }
      },
    ),
  );
