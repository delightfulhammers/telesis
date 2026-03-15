import { Command } from "commander";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import {
  load,
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
import { loadPipelineState, removePipelineState } from "../pipeline/state.js";
import { STAGE_ORDER } from "../pipeline/types.js";
import { loadWorkItem } from "../intake/store.js";

/** Check whether a stage is resumable (exists in STAGE_ORDER) */
const isResumableStage = (stage: string): boolean =>
  (STAGE_ORDER as readonly string[]).includes(stage);
import { runChecks } from "../drift/runner.js";
import { allChecks } from "../drift/checks/index.js";

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
  .option(
    "--no-review",
    "Skip the review stage even if reviewBeforePush is enabled in config",
  )
  .option("--no-quality-check", "Skip quality gates")
  .option("--branch <name>", "Override branch name")
  .option("--resume", "Auto-resume from partial state without prompting")
  .option("--restart", "Discard partial state and start fresh")
  .action(
    handleAction(
      async (
        workItemId: string,
        opts: {
          agent?: string;
          autoApprove?: boolean;
          push?: boolean;
          validate?: boolean;
          review?: boolean;
          qualityCheck?: boolean;
          branch?: string;
          resume?: boolean;
          restart?: boolean;
        },
      ) => {
        const rootDir = projectRoot();
        const cfg = load(rootDir);
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
          ...(opts.review === false ? { reviewBeforePush: false } : {}),
          ...(opts.qualityCheck === false ? { qualityGates: undefined } : {}),
        };

        // Resolve work item to get full ID for state lookup
        const workItem = loadWorkItem(rootDir, workItemId);
        const fullId = workItem?.id;

        // Check for existing pipeline state (resume/restart logic)
        let resumeState;
        if (fullId) {
          const existingState = loadPipelineState(rootDir, fullId);

          if (existingState) {
            if (!isResumableStage(existingState.currentStage)) {
              console.error(
                `Pipeline stopped in terminal state "${existingState.currentStage}". Use --restart to start fresh.`,
              );
              removePipelineState(rootDir, fullId);
              process.exitCode = 1;
              return;
            }

            if (opts.restart) {
              removePipelineState(rootDir, fullId);
            } else if (opts.resume) {
              resumeState = existingState;
            } else {
              // Prompt user
              const { confirm: promptConfirm, close: promptClose } =
                createConfirm();
              try {
                const shouldResume = await promptConfirm(
                  `Pipeline for ${fullId.slice(0, 8)} stopped at "${existingState.currentStage}". Resume? (y/n)`,
                );
                if (shouldResume) {
                  resumeState = existingState;
                } else {
                  removePipelineState(rootDir, fullId);
                }
              } finally {
                promptClose();
              }
            }
          }
        }

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
              runDriftChecks: (rootDir) =>
                runChecks(allChecks, rootDir, undefined, cfg.project.languages),
            },
            workItemId,
            {
              branchOverride: opts.branch,
              resumeState,
            },
          );

          console.log("");
          console.log(formatRunResult(result));

          if (
            result.stage === "failed" ||
            result.stage === "quality_check_failed" ||
            result.stage === "review_failed"
          ) {
            process.exitCode = 1;
          }
        } finally {
          close();
        }
      },
    ),
  );
