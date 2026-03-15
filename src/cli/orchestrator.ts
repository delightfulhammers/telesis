import { Command } from "commander";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import { loadContext } from "../orchestrator/persistence.js";
import { createContext } from "../orchestrator/machine.js";
import { advance } from "../orchestrator/runner.js";
import { buildRunnerDeps } from "../orchestrator/deps.js";
import { createModelClient, createSdk } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { createBus } from "../daemon/bus.js";
import {
  listPendingDecisions,
  resolveDecision,
} from "../orchestrator/decisions.js";
import { runPreflight } from "../orchestrator/preflight.js";
import { randomUUID } from "node:crypto";

const statusCommand = new Command("status")
  .description("Show orchestrator state and pending decisions")
  .action(
    handleAction(() => {
      const rootDir = projectRoot();
      const ctx = loadContext(rootDir);

      if (!ctx) {
        console.log("Orchestrator: not running (no persisted state)");
        return;
      }

      console.log(`Orchestrator: ${ctx.state}`);
      if (ctx.milestoneId) {
        console.log(
          `Milestone:    ${ctx.milestoneName ?? ctx.milestoneId} (${ctx.milestoneId})`,
        );
      }
      if (ctx.workItemIds.length > 0) {
        console.log(`Work items:   ${ctx.workItemIds.length}`);
      }
      if (ctx.planId) {
        console.log(`Plan:         ${ctx.planId.slice(0, 8)}`);
      }
      if (ctx.reviewRound) {
        console.log(
          `Review:       round ${ctx.reviewRound}${ctx.reviewFindings !== undefined ? `, ${ctx.reviewFindings} findings` : ""}`,
        );
      }
      console.log(`Updated:      ${ctx.updatedAt}`);

      const pending = listPendingDecisions(rootDir);
      if (pending.length > 0) {
        console.log("");
        console.log(`Pending decisions (${pending.length}):`);
        for (const d of pending) {
          console.log(`  [${d.id.slice(0, 8)}] ${d.kind} — ${d.summary}`);
        }
      }
    }),
  );

const approveCommand = new Command("approve")
  .description("Approve a pending decision")
  .argument("<decision-id>", "Decision ID or prefix")
  .action(
    handleAction((decisionId: string) => {
      const rootDir = projectRoot();
      const resolved = resolveDecision(rootDir, decisionId, "approved");
      console.log(
        `Approved: [${resolved.id.slice(0, 8)}] ${resolved.kind} — ${resolved.summary}`,
      );
    }),
  );

const rejectCommand = new Command("reject")
  .description("Reject a pending decision with a reason")
  .argument("<decision-id>", "Decision ID or prefix")
  .requiredOption("--reason <text>", "Reason for rejection")
  .action(
    handleAction((decisionId: string, opts: { reason: string }) => {
      const rootDir = projectRoot();
      const resolved = resolveDecision(
        rootDir,
        decisionId,
        "rejected",
        opts.reason,
      );
      console.log(
        `Rejected: [${resolved.id.slice(0, 8)}] ${resolved.kind} — ${opts.reason}`,
      );
    }),
  );

const preflightCommand = new Command("preflight")
  .description("Run preflight checks (used by Claude Code hooks)")
  .action(
    handleAction(() => {
      const rootDir = projectRoot();
      const result = runPreflight(rootDir);

      console.log(`Preflight: ${result.passed ? "PASS" : "FAIL"}`);
      for (const check of result.checks) {
        const indicator = check.passed ? "✓" : "✗";
        console.log(`  ${indicator} ${check.name}: ${check.message}`);
      }

      if (!result.passed) {
        process.exitCode = 1;
      }
    }),
  );

const runCommand = new Command("run")
  .description(
    "Advance the orchestrator until it reaches a decision point or returns to idle",
  )
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();

      // Load or create orchestrator state
      let ctx = loadContext(rootDir) ?? createContext();

      // Create a lightweight bus for event emission (not a full daemon)
      const bus = createBus();

      // Create model client for LLM judgment calls
      const sessionId = randomUUID();
      const telemetry = createTelemetryLogger(rootDir);
      const client = createModelClient({
        sdk: createSdk(),
        telemetry,
        sessionId,
        component: "orchestrator",
      });

      const deps = buildRunnerDeps(rootDir, bus, client);

      const MAX_STEPS = 50;
      let steps = 0;

      console.log(`Orchestrator: starting from state "${ctx.state}"`);

      for (steps = 0; steps < MAX_STEPS; steps++) {
        const result = await advance(ctx, deps);
        ctx = result.context;

        if (result.error) {
          console.error(`Error: ${result.error}`);
          process.exitCode = 1;
          break;
        }

        if (result.waiting) {
          const pending = listPendingDecisions(rootDir);
          console.log(`Orchestrator: waiting in state "${ctx.state}"`);
          if (pending.length > 0) {
            console.log("");
            console.log("Pending decisions:");
            for (const d of pending) {
              console.log(`  [${d.id.slice(0, 8)}] ${d.kind} — ${d.summary}`);
            }
            console.log("");
            console.log(
              "Use `telesis orchestrator approve <id>` or `reject <id> --reason ...`",
            );
          }
          break;
        }

        console.log(`  → ${ctx.state}`);

        if (ctx.state === "idle") {
          console.log("Orchestrator: returned to idle");
          break;
        }
      }

      if (steps >= MAX_STEPS) {
        console.error("Orchestrator: max steps reached, stopping");
        process.exitCode = 1;
      }

      bus.dispose();
    }),
  );

export const orchestratorCommand = new Command("orchestrator")
  .description("Orchestrator state and decision management")
  .addCommand(statusCommand)
  .addCommand(approveCommand)
  .addCommand(rejectCommand)
  .addCommand(preflightCommand)
  .addCommand(runCommand);
