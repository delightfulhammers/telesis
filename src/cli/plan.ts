import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import { parseDispatchConfig, parsePlannerConfig } from "../config/config.js";
import { loadWorkItem } from "../intake/store.js";
import { listPlans, loadPlan, updatePlan } from "../plan/store.js";
import type { PlanStatus } from "../plan/types.js";
import { createPlanFromWorkItem } from "../plan/create.js";
import { formatPlanList, formatPlanDetail } from "../plan/format.js";
import { executePlan } from "../plan/executor.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import { createEventRenderer } from "../daemon/tui.js";
import { createSdk, createModelClient } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";

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

      const plannerConfig = parsePlannerConfig(rootDir);
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
  .description("Execute an approved plan (dispatch tasks sequentially)")
  .argument("<plan-id>", "Plan ID or prefix")
  .option("--agent <name>", "Agent to use (claude, codex, gemini, etc.)")
  .action(
    handleAction(async (planId: string, opts: { agent?: string }) => {
      const rootDir = projectRoot();
      const plan = loadPlan(rootDir, planId);

      if (!plan) {
        console.error(`No plan matching "${planId}"`);
        process.exitCode = 1;
        return;
      }

      const resumable = new Set(["approved", "failed", "executing"]);
      if (!resumable.has(plan.status)) {
        console.error(
          `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "approved", "failed", or "executing"`,
        );
        process.exitCode = 1;
        return;
      }

      const config = parseDispatchConfig(rootDir);
      const agent = opts.agent ?? config.defaultAgent ?? "claude";
      const adapter = createAcpxAdapter({ acpxPath: config.acpxPath });
      const renderer = createEventRenderer();

      const result = await executePlan(
        {
          rootDir,
          adapter,
          agent,
          onEvent: renderer,
          maxConcurrent: config.maxConcurrent,
        },
        plan,
      );

      console.log("");
      if (result.status === "completed") {
        console.log(
          `Plan ${plan.id.slice(0, 8)} completed — ${result.completedTasks}/${result.totalTasks} tasks in ${Math.floor(result.durationMs / 1000)}s`,
        );
      } else {
        console.log(
          `Plan ${plan.id.slice(0, 8)} failed — ${result.completedTasks}/${result.totalTasks} tasks completed`,
        );
        process.exitCode = 1;
      }
    }),
  );

export const planCommand = new Command("plan")
  .description("Decompose work items into executable task plans")
  .addCommand(createCommand)
  .addCommand(listCommand)
  .addCommand(showCommand)
  .addCommand(approveCommand)
  .addCommand(executeCommand);
