import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import {
  loadRawConfig,
  parseDispatchConfig,
  parsePlannerConfig,
  parseValidationConfig,
} from "../config/config.js";
import { loadWorkItem } from "../intake/store.js";
import { listPlans, loadPlan, updatePlan } from "../plan/store.js";
import type { PlanStatus } from "../plan/types.js";
import { createPlanFromWorkItem } from "../plan/create.js";
import { formatPlanList, formatPlanDetail } from "../plan/format.js";
import {
  executePlan,
  type ExecutorDeps,
  type ExecutionResult,
} from "../plan/executor.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import { createEventRenderer } from "../daemon/tui.js";
import { createSdk, createModelClient } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";

/** Build ExecutorDeps from CLI options — shared by execute and retry commands */
const buildExecutorDeps = (
  rootDir: string,
  opts: { agent?: string; validate?: boolean },
): ExecutorDeps => {
  const rawConfig = loadRawConfig(rootDir);
  const dispatchConfig = parseDispatchConfig(rawConfig);
  const validationConfig = parseValidationConfig(rawConfig);
  const agent = opts.agent ?? dispatchConfig.defaultAgent ?? "claude";
  const adapter = createAcpxAdapter({ acpxPath: dispatchConfig.acpxPath });
  const renderer = createEventRenderer();

  const sessionId = randomUUID();
  const telemetry = createTelemetryLogger(rootDir);
  const modelClient = createModelClient({
    sdk: createSdk(),
    telemetry,
    sessionId,
    component: "validator",
    defaultModel: validationConfig.model,
  });

  const effectiveValidationConfig =
    opts.validate === false
      ? { ...validationConfig, maxRetries: 0 }
      : validationConfig;

  return {
    rootDir,
    adapter,
    agent,
    onEvent: renderer,
    maxConcurrent: dispatchConfig.maxConcurrent,
    modelClient,
    validationConfig: effectiveValidationConfig,
  };
};

/** Print execution result — shared by execute and retry commands */
const printExecutionResult = (
  result: ExecutionResult,
  planIdShort: string,
): void => {
  console.log("");
  if (result.status === "completed") {
    console.log(
      `Plan ${planIdShort} completed — ${result.completedTasks}/${result.totalTasks} tasks in ${Math.floor(result.durationMs / 1000)}s`,
    );
  } else if (result.status === "awaiting_gate") {
    console.log(
      `Plan ${planIdShort} awaiting gate approval — ${result.completedTasks}/${result.totalTasks} tasks completed`,
    );
    console.log(
      `Run \`telesis plan gate-approve ${planIdShort}\` to finalize.`,
    );
  } else if (result.status === "escalated") {
    console.log(`Plan ${planIdShort} escalated — validation retries exhausted`);
    console.log(
      `Run \`telesis plan retry ${planIdShort}\` to re-execute or \`telesis plan skip-task ${planIdShort} <task-id>\` to skip.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Plan ${planIdShort} failed — ${result.completedTasks}/${result.totalTasks} tasks completed`,
    );
    process.exitCode = 1;
  }
};

const createCommand = new Command("create")
  .description("Decompose a work item into tasks via LLM")
  .argument("<work-item-id>", "Work item ID or prefix")
  .action(
    handleAction(async (workItemId: string) => {
      const rootDir = projectRoot();
      const workItem = loadWorkItem(rootDir, workItemId);

      if (!workItem) {
        console.error(`No work item matching "${workItemId}"`);
        process.exitCode = 1;
        return;
      }

      const rawConfig = loadRawConfig(rootDir);
      const plannerConfig = parsePlannerConfig(rawConfig);
      const sessionId = randomUUID();
      const telemetry = createTelemetryLogger(rootDir);
      const client = createModelClient({
        sdk: createSdk(),
        telemetry,
        sessionId,
        component: "planner",
        defaultModel: plannerConfig.model,
      });

      console.log(
        `Planning work item ${workItem.id.slice(0, 8)}: ${workItem.title}`,
      );

      const plan = await createPlanFromWorkItem(
        client,
        rootDir,
        workItem,
        plannerConfig.model,
        plannerConfig.maxTasks,
      );

      console.log("");
      console.log(formatPlanDetail(plan));
      console.log("");
      console.log(
        `Plan ${plan.id.slice(0, 8)} created as draft. Use \`telesis plan approve ${plan.id.slice(0, 8)}\` to approve.`,
      );
    }),
  );

const listCommand = new Command("list")
  .description("List plans")
  .option("--all", "Show all statuses (default: non-completed)")
  .option("--json", "Output as JSON")
  .action(
    handleAction((opts: { all?: boolean; json?: boolean }) => {
      const rootDir = projectRoot();
      const filter = opts.all
        ? undefined
        : {
            status: [
              "draft",
              "approved",
              "executing",
              "failed",
              "escalated",
              "awaiting_gate",
            ] as PlanStatus[],
          };
      const plans = listPlans(rootDir, filter);

      if (opts.json) {
        console.log(JSON.stringify(plans, null, 2));
        return;
      }

      console.log(formatPlanList(plans));
    }),
  );

const showCommand = new Command("show")
  .description("Show plan detail with task graph")
  .argument("<plan-id>", "Plan ID or prefix")
  .action(
    handleAction((planId: string) => {
      const rootDir = projectRoot();
      const plan = loadPlan(rootDir, planId);

      if (!plan) {
        console.error(`No plan matching "${planId}"`);
        process.exitCode = 1;
        return;
      }

      console.log(formatPlanDetail(plan));
    }),
  );

const approveCommand = new Command("approve")
  .description("Approve a plan (transition draft → approved)")
  .argument("<plan-id>", "Plan ID or prefix")
  .action(
    handleAction((planId: string) => {
      const rootDir = projectRoot();
      const plan = loadPlan(rootDir, planId);

      if (!plan) {
        console.error(`No plan matching "${planId}"`);
        process.exitCode = 1;
        return;
      }

      if (plan.status !== "draft") {
        console.error(
          `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "draft"`,
        );
        process.exitCode = 1;
        return;
      }

      const approved = {
        ...plan,
        status: "approved" as const,
        approvedAt: new Date().toISOString(),
      };
      updatePlan(rootDir, approved);

      console.log(`Plan ${plan.id.slice(0, 8)} approved.`);
    }),
  );

const executeCommand = new Command("execute")
  .description(
    "Execute an approved plan (dispatch tasks with validation by default)",
  )
  .argument("<plan-id>", "Plan ID or prefix")
  .option("--agent <name>", "Agent to use (claude, codex, gemini, etc.)")
  .option("--no-validate", "Skip validation loop")
  .action(
    handleAction(
      async (planId: string, opts: { agent?: string; validate?: boolean }) => {
        const rootDir = projectRoot();
        const plan = loadPlan(rootDir, planId);

        if (!plan) {
          console.error(`No plan matching "${planId}"`);
          process.exitCode = 1;
          return;
        }

        const resumable = new Set([
          "approved",
          "failed",
          "executing",
          "escalated",
        ]);
        if (!resumable.has(plan.status)) {
          console.error(
            `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "approved", "failed", "escalated", or "executing"`,
          );
          process.exitCode = 1;
          return;
        }

        const deps = buildExecutorDeps(rootDir, opts);
        const result = await executePlan(deps, plan);
        printExecutionResult(result, plan.id.slice(0, 8));
      },
    ),
  );

const retryCommand = new Command("retry")
  .description(
    "Re-execute an escalated or failed plan from the first incomplete task",
  )
  .argument("<plan-id>", "Plan ID or prefix")
  .option("--agent <name>", "Agent to use")
  .option("--no-validate", "Skip validation loop")
  .action(
    handleAction(
      async (planId: string, opts: { agent?: string; validate?: boolean }) => {
        const rootDir = projectRoot();
        const plan = loadPlan(rootDir, planId);

        if (!plan) {
          console.error(`No plan matching "${planId}"`);
          process.exitCode = 1;
          return;
        }

        const retryable = new Set(["escalated", "failed"]);
        if (!retryable.has(plan.status)) {
          const hint =
            plan.status === "awaiting_gate"
              ? ` (use \`telesis plan gate-approve ${plan.id.slice(0, 8)}\` instead)`
              : "";
          console.error(
            `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "escalated" or "failed"${hint}`,
          );
          process.exitCode = 1;
          return;
        }

        // Reset escalated/failed tasks to pending for re-execution
        const resetTasks = plan.tasks.map((t) =>
          t.status === "escalated" || t.status === "failed"
            ? {
                ...t,
                status: "pending" as const,
                error: undefined,
                validationAttempts: undefined,
                validationErrors: undefined,
                correctionSessionIds: undefined,
              }
            : t,
        );

        const resetPlan = {
          ...plan,
          tasks: resetTasks,
          status: "approved" as const,
          error: undefined,
          completedAt: undefined,
        };
        updatePlan(rootDir, resetPlan);

        console.log(
          `Plan ${plan.id.slice(0, 8)} reset to approved. Executing...`,
        );

        const deps = buildExecutorDeps(rootDir, opts);
        const result = await executePlan(deps, resetPlan);
        printExecutionResult(result, plan.id.slice(0, 8));
      },
    ),
  );

const skipTaskCommand = new Command("skip-task")
  .description("Skip an escalated task and resume plan execution")
  .argument("<plan-id>", "Plan ID or prefix")
  .argument("<task-id>", "Task ID to skip")
  .action(
    handleAction((planId: string, taskId: string) => {
      const rootDir = projectRoot();
      const plan = loadPlan(rootDir, planId);

      if (!plan) {
        console.error(`No plan matching "${planId}"`);
        process.exitCode = 1;
        return;
      }

      const task = plan.tasks.find((t) => t.id === taskId);
      if (!task) {
        console.error(`No task "${taskId}" in plan ${plan.id.slice(0, 8)}`);
        process.exitCode = 1;
        return;
      }

      if (task.status !== "escalated" && task.status !== "failed") {
        console.error(
          `Task "${taskId}" has status "${task.status}", expected "escalated" or "failed"`,
        );
        process.exitCode = 1;
        return;
      }

      const updatedTasks = plan.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "skipped" as const } : t,
      );

      // If the plan was escalated/failed because of this task, reset to approved for re-execution
      const updatedPlan = {
        ...plan,
        tasks: updatedTasks,
        status: "approved" as const,
        error: undefined,
      };
      updatePlan(rootDir, updatedPlan);

      console.log(
        `Task "${taskId}" skipped. Plan ${plan.id.slice(0, 8)} reset to approved.`,
      );
      console.log(
        `Run \`telesis plan execute ${plan.id.slice(0, 8)}\` to resume.`,
      );
    }),
  );

const gateApproveCommand = new Command("gate-approve")
  .description(
    "Approve a milestone gate (transition awaiting_gate → completed)",
  )
  .argument("<plan-id>", "Plan ID or prefix")
  .action(
    handleAction((planId: string) => {
      const rootDir = projectRoot();
      const plan = loadPlan(rootDir, planId);

      if (!plan) {
        console.error(`No plan matching "${planId}"`);
        process.exitCode = 1;
        return;
      }

      if (plan.status !== "awaiting_gate") {
        console.error(
          `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "awaiting_gate"`,
        );
        process.exitCode = 1;
        return;
      }

      const completed = {
        ...plan,
        status: "completed" as const,
        completedAt: new Date().toISOString(),
      };
      updatePlan(rootDir, completed);

      console.log(`Plan ${plan.id.slice(0, 8)} gate approved — completed.`);
    }),
  );

export const planCommand = new Command("plan")
  .description("Decompose work items into executable task plans")
  .addCommand(createCommand)
  .addCommand(listCommand)
  .addCommand(showCommand)
  .addCommand(approveCommand)
  .addCommand(executeCommand)
  .addCommand(retryCommand)
  .addCommand(skipTaskCommand)
  .addCommand(gateApproveCommand);
