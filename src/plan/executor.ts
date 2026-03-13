import type { AgentAdapter } from "../dispatch/adapter.js";
import { dispatch } from "../dispatch/dispatcher.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { createEvent } from "../daemon/types.js";
import { updatePlan } from "./store.js";
import { topologicalSort } from "./validate.js";
import type { Plan, PlanStatus, PlanTask } from "./types.js";

/** Dependencies injected into the executor */
export interface ExecutorDeps {
  readonly rootDir: string;
  readonly adapter: AgentAdapter;
  readonly agent: string;
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly maxConcurrent?: number;
}

/** Result of plan execution */
export interface ExecutionResult {
  readonly planId: string;
  readonly status: PlanStatus;
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly durationMs: number;
}

/** Build the task prompt including context from completed predecessors */
const buildTaskPrompt = (task: PlanTask, plan: Plan): string => {
  const completedTasks = plan.tasks.filter((t) => t.status === "completed");

  const predecessorContext =
    completedTasks.length > 0
      ? [
          "The following tasks have already been completed:",
          ...completedTasks.map((t) => `- ${t.id}: ${t.title}`),
          "",
        ].join("\n")
      : "";

  return [
    `You are executing task "${task.id}" from a larger plan: "${plan.title}"`,
    "",
    predecessorContext,
    `## Current Task: ${task.title}`,
    "",
    task.description,
  ].join("\n");
};

/** Update a single task within a plan, returning the new plan */
const withTaskUpdate = (
  plan: Plan,
  taskId: string,
  update: Partial<PlanTask>,
): Plan => ({
  ...plan,
  tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, ...update } : t)),
});

/** Execute an approved plan by dispatching tasks in topological order */
export const executePlan = async (
  deps: ExecutorDeps,
  plan: Plan,
): Promise<ExecutionResult> => {
  const RESUMABLE_STATUSES = new Set(["approved", "failed", "executing"]);
  if (!RESUMABLE_STATUSES.has(plan.status)) {
    throw new Error(
      `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "approved", "failed", or "executing"`,
    );
  }

  const sortResult = topologicalSort(plan.tasks);
  if (!sortResult.valid) {
    throw new Error(`Invalid plan dependency graph: ${sortResult.error}`);
  }

  const startTime = Date.now();

  // Normalize any 'running' tasks from a prior crash back to 'pending'
  const normalizedTasks = plan.tasks.map((t) =>
    t.status === "running" ? { ...t, status: "pending" as const } : t,
  );

  // Transition plan to executing, clearing stale fields from previous runs
  // Preserve original startedAt on resume so duration reporting is accurate
  let currentPlan: Plan = {
    ...plan,
    tasks: normalizedTasks,
    status: "executing",
    startedAt: plan.startedAt ?? new Date().toISOString(),
    error: undefined,
    completedAt: undefined,
  };
  updatePlan(deps.rootDir, currentPlan);

  deps.onEvent?.(
    createEvent("plan:executing", {
      planId: plan.id,
      workItemId: plan.workItemId,
      title: plan.title,
    }),
  );

  let completedCount = currentPlan.tasks.filter(
    (t) => t.status === "completed",
  ).length;

  for (const taskId of sortResult.order) {
    const task = currentPlan.tasks.find((t) => t.id === taskId)!;

    // Skip already completed tasks (crash recovery)
    if (task.status === "completed") continue;

    // Mark task as running
    currentPlan = withTaskUpdate(currentPlan, taskId, { status: "running" });
    updatePlan(deps.rootDir, currentPlan);

    deps.onEvent?.(
      createEvent("plan:task:started", {
        planId: plan.id,
        taskId,
        title: task.title,
      }),
    );

    const taskPrompt = buildTaskPrompt(task, currentPlan);

    try {
      const result = await dispatch(
        {
          rootDir: deps.rootDir,
          adapter: deps.adapter,
          onEvent: deps.onEvent,
          maxConcurrent: deps.maxConcurrent,
        },
        deps.agent,
        taskPrompt,
      );

      if (result.status === "completed") {
        currentPlan = withTaskUpdate(currentPlan, taskId, {
          status: "completed",
          sessionId: result.sessionId,
          completedAt: new Date().toISOString(),
        });
        updatePlan(deps.rootDir, currentPlan);
        completedCount++;

        deps.onEvent?.(
          createEvent("plan:task:completed", {
            planId: plan.id,
            taskId,
            title: task.title,
          }),
        );
      } else {
        // Dispatch returned non-completed status
        currentPlan = withTaskUpdate(currentPlan, taskId, {
          status: "failed",
          sessionId: result.sessionId,
          error: "dispatch returned non-completed status",
        });
        currentPlan = {
          ...currentPlan,
          status: "failed",
          error: `Task "${taskId}" failed: dispatch returned non-completed status`,
          completedAt: new Date().toISOString(),
        };
        updatePlan(deps.rootDir, currentPlan);

        deps.onEvent?.(
          createEvent("plan:task:failed", {
            planId: plan.id,
            taskId,
            title: task.title,
          }),
        );

        deps.onEvent?.(
          createEvent("plan:failed", {
            planId: plan.id,
            workItemId: plan.workItemId,
            title: plan.title,
          }),
        );

        return {
          planId: plan.id,
          status: "failed",
          completedTasks: completedCount,
          totalTasks: plan.tasks.length,
          durationMs: Date.now() - startTime,
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "unknown error";

      currentPlan = withTaskUpdate(currentPlan, taskId, {
        status: "failed",
        error: errorMessage,
      });
      currentPlan = {
        ...currentPlan,
        status: "failed",
        error: `Task "${taskId}" failed: ${errorMessage}`,
        completedAt: new Date().toISOString(),
      };
      updatePlan(deps.rootDir, currentPlan);

      deps.onEvent?.(
        createEvent("plan:task:failed", {
          planId: plan.id,
          taskId,
          title: task.title,
        }),
      );

      deps.onEvent?.(
        createEvent("plan:failed", {
          planId: plan.id,
          workItemId: plan.workItemId,
          title: plan.title,
        }),
      );

      return {
        planId: plan.id,
        status: "failed",
        completedTasks: completedCount,
        totalTasks: plan.tasks.length,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // All tasks completed
  currentPlan = {
    ...currentPlan,
    status: "completed",
    completedAt: new Date().toISOString(),
  };
  updatePlan(deps.rootDir, currentPlan);

  deps.onEvent?.(
    createEvent("plan:completed", {
      planId: plan.id,
      workItemId: plan.workItemId,
      title: plan.title,
    }),
  );

  return {
    planId: plan.id,
    status: "completed",
    completedTasks: completedCount,
    totalTasks: plan.tasks.length,
    durationMs: Date.now() - startTime,
  };
};
