import { execFileSync } from "node:child_process";
import type { EventBus } from "../daemon/bus.js";
import { createEvent } from "../daemon/types.js";
import type { ModelClient } from "../agent/model/client.js";
import { listWorkItems, loadWorkItem } from "../intake/store.js";
import { checkMilestone } from "../milestones/check.js";
import { completeMilestone } from "../milestones/complete.js";
import { loadPlan } from "../plan/store.js";
import { createPlanFromWorkItem } from "../plan/create.js";
import { executePlan } from "../plan/executor.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import {
  loadRawConfig,
  load,
  parseDispatchConfig,
  parseValidationConfig,
  parsePipelineConfig,
} from "../config/config.js";
import { runQualityGates as runGates } from "../pipeline/quality-gates.js";
import { hasChanges, stageAll, amendCommit } from "../git/operations.js";
import { allChecks } from "../drift/checks/index.js";
import { runChecks } from "../drift/runner.js";
// Import from pipeline.ts — the public contract of the review module.
// pipeline.ts re-exports the types that external consumers need.
import { runReview } from "../agent/review/pipeline.js";
// Note: pipeline.ts IS the review facade — it was established as such in v0.21.0 (TDD-015).
import { suggestTriageGrouping, assessTddNecessity } from "./judgment.js";
import {
  listPendingDecisions,
  createDecision as createDecisionRaw,
} from "./decisions.js";
import { saveContext as saveContextRaw } from "./persistence.js";
import { notify } from "./notify.js";
import { runConvergenceLoop } from "./convergence.js";
import type { RunnerDeps, WorkItemSummary } from "./runner.js";
import type { OrchestratorContext, OrchestratorState } from "./types.js";

/**
 * Constructs real RunnerDeps from the project's rootDir, daemon bus, and model client.
 *
 * This is the composition root — the single place where abstract deps meet concrete
 * implementations. The orchestrator runner and its tests never import business logic
 * modules directly; they go through this factory.
 */
export const buildRunnerDeps = (
  rootDir: string,
  bus: EventBus,
  client: ModelClient,
): RunnerDeps => ({
  syncIntake: async () => {
    // For now, sync is manual (telesis intake github). The orchestrator
    // reads whatever work items are already in the store.
    const items = listWorkItems(rootDir, {
      status: ["pending"],
    });
    return {
      imported: items.length,
      workItemIds: items.map((i) => i.id),
    };
  },

  loadWorkItems: (ids: readonly string[]): readonly WorkItemSummary[] => {
    const results: WorkItemSummary[] = [];
    for (const id of ids) {
      const item = loadWorkItem(rootDir, id);
      if (item) {
        results.push({
          id: item.id,
          title: item.title,
          body: item.body ?? "",
        });
      }
    }
    return results;
  },

  suggestGrouping: (workItems) => suggestTriageGrouping(client, workItems),

  assessTdd: (input) => assessTddNecessity(client, input),

  createMilestoneEntry: () => {
    // Milestone entry creation is a human action — the orchestrator
    // creates a decision for this. The actual MILESTONES.md edit happens
    // outside the orchestrator (by the human or a coding agent).
  },

  createPlan: async (workItemId) => {
    const item = loadWorkItem(rootDir, workItemId);
    if (!item) {
      throw new Error(`Work item not found: ${workItemId}`);
    }
    const plan = await createPlanFromWorkItem(client, rootDir, item);
    return plan.id;
  },

  executeTasks: async (planId) => {
    const plan = loadPlan(rootDir, planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const rawConfig = loadRawConfig(rootDir);
    const dispatchConfig = parseDispatchConfig(rawConfig);
    const validationConfig = parseValidationConfig(rawConfig);

    const adapter = createAcpxAdapter({
      acpxPath: dispatchConfig.acpxPath,
    });
    const agent = dispatchConfig.defaultAgent ?? "claude";

    const result = await executePlan(
      {
        rootDir,
        adapter,
        agent,
        onEvent: (event) => bus.publish(event),
        maxConcurrent: dispatchConfig.maxConcurrent,
        modelClient: client,
        validationConfig,
      },
      plan,
    );

    return {
      allComplete: result.status === "completed",
      error:
        result.status !== "completed"
          ? `Plan ended with status: ${result.status}`
          : undefined,
    };
  },

  runQualityGates: async () => {
    const rawConfig = loadRawConfig(rootDir);
    const pipelineConfig = parsePipelineConfig(rawConfig);
    const gatesConfig = pipelineConfig.qualityGates ?? {};

    const cfg = load(rootDir);
    const driftRunner = (dir: string) => {
      const report = runChecks(
        allChecks,
        dir,
        undefined,
        cfg.project.languages,
      );
      return { passed: report.passed };
    };

    // Quality gate commands come from .telesis/config.yml (operator-controlled,
    // not untrusted user input). The sh -c pattern matches the existing
    // quality-gates.ts contract and its test fixtures.
    const exec = (command: string, cwd: string) => {
      execFileSync("sh", ["-c", command], { cwd, stdio: "pipe" });
    };

    const { summary } = runGates(
      {
        rootDir,
        workItemId: "orchestrator",
        onEvent: (event) => bus.publish(event),
        hasChanges,
        stageAll,
        amendCommit,
        runDriftChecks: driftRunner,
        execCommand: exec,
      },
      gatesConfig,
    );

    return {
      passed: summary.passed,
      error: summary.passed
        ? undefined
        : summary.results
            .filter((r) => !r.passed)
            .map((r) => `${r.gate}: ${r.error ?? "failed"}`)
            .join("; "),
    };
  },

  runReviewConvergence: async () => {
    const result = await runConvergenceLoop({
      runReview: () => runReview(client, rootDir, {}),
      dispatchFix: async () => {
        // For now, dispatch fix is a no-op — the human or a coding agent
        // handles the fixes. The orchestrator just re-reviews.
      },
      stageChanges: () => {
        stageAll(rootDir);
      },
      maxRounds: 5,
      convergenceThreshold: 3,
    });

    return {
      converged: result.converged,
      rounds: result.rounds,
      finalFindings: result.finalFindings,
    };
  },

  runMilestoneCheck: async () => {
    const report = checkMilestone(rootDir);
    return {
      passed: report.passed,
      error: report.passed
        ? undefined
        : report.results
            .filter((r) => !r.passed)
            .map((r) => r.message)
            .join("; "),
    };
  },

  runMilestoneComplete: () => {
    completeMilestone(rootDir);
  },

  listPendingDecisions: () => listPendingDecisions(rootDir),

  createDecision: (input) => createDecisionRaw(rootDir, input),

  notify,

  saveContext: (ctx: OrchestratorContext) => saveContextRaw(rootDir, ctx),

  emitEvent: (payload: {
    fromState: OrchestratorState;
    toState: OrchestratorState;
    milestoneId?: string;
  }) => {
    bus.publish(
      createEvent("orchestrator:state_changed", {
        fromState: payload.fromState,
        toState: payload.toState,
        milestoneId: payload.milestoneId,
      }),
    );
  },
});
