import type { AgentAdapter } from "../dispatch/adapter.js";
import { dispatch } from "../dispatch/dispatcher.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { createEvent } from "../daemon/types.js";
import type { ModelClient } from "../agent/model/client.js";
import {
  captureRef,
  diffSinceRef,
  summarizeSessionEvents,
} from "../validation/diff-capture.js";
import { validateTask } from "../validation/validator.js";
import { buildCorrectionPrompt } from "../validation/correction.js";
import {
  DEFAULT_MAX_RETRIES,
  type ValidationConfig,
} from "../validation/types.js";
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
  readonly modelClient?: ModelClient;
  readonly validationConfig?: ValidationConfig;
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

/** Mark a task as failed and the plan as failed, persist and emit events */
const failTask = (
  deps: ExecutorDeps,
  currentPlan: Plan,
  taskId: string,
  title: string,
  sessionId: string | undefined,
  errorMessage: string,
): Plan => {
  let plan = withTaskUpdate(currentPlan, taskId, {
    status: "failed",
    sessionId,
    error: errorMessage,
  });
  plan = {
    ...plan,
    status: "failed",
    error: `Task "${taskId}" failed: ${errorMessage}`,
    completedAt: new Date().toISOString(),
  };
  updatePlan(deps.rootDir, plan);

  deps.onEvent?.(
    createEvent("plan:task:failed", {
      planId: plan.id,
      taskId,
      title,
    }),
  );

  deps.onEvent?.(
    createEvent("plan:failed", {
      planId: plan.id,
      workItemId: plan.workItemId,
      title: plan.title,
    }),
  );

  return plan;
};

/** Run the validate-correct loop for a completed task dispatch */
const validateCorrectLoop = async (
  deps: ExecutorDeps,
  currentPlan: Plan,
  task: PlanTask,
  preRef: string,
  initialSessionId: string,
): Promise<{ plan: Plan; passed: boolean }> => {
  const client = deps.modelClient!;
  const config = deps.validationConfig!;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const planId = currentPlan.id;
  let plan = currentPlan;
  let lastSessionId = initialSessionId;
  const correctionSessionIds: string[] = [];
  let lastErrors: readonly string[] = [];
  let lastAttempt = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastAttempt = attempt;
    // Mark task as validating
    plan = withTaskUpdate(plan, task.id, { status: "validating" });
    updatePlan(deps.rootDir, plan);

    deps.onEvent?.(
      createEvent("validation:started", {
        planId,
        taskId: task.id,
        attempt,
      }),
    );

    const diff = diffSinceRef(deps.rootDir, preRef);
    const summary = summarizeSessionEvents(deps.rootDir, lastSessionId);
    const result = await validateTask(
      client,
      task,
      diff,
      summary,
      deps.rootDir,
      config.model,
    );

    if (result.verdict.passed) {
      deps.onEvent?.(
        createEvent("validation:passed", {
          planId,
          taskId: task.id,
          attempt,
        }),
      );

      plan = withTaskUpdate(plan, task.id, {
        status: "completed",
        sessionId: initialSessionId,
        completedAt: new Date().toISOString(),
        validationAttempts: attempt,
        correctionSessionIds:
          correctionSessionIds.length > 0 ? correctionSessionIds : undefined,
      });
      updatePlan(deps.rootDir, plan);

      return { plan, passed: true };
    }

    // Validation failed — track errors for escalation reporting
    const errors = result.verdict.criteria
      .filter((c) => !c.met)
      .map((c) => c.criterion);
    lastErrors = errors;

    deps.onEvent?.(
      createEvent("validation:failed", {
        planId,
        taskId: task.id,
        attempt,
      }),
    );

    if (attempt < maxRetries) {
      // Correction attempt
      deps.onEvent?.(
        createEvent("validation:correction:started", {
          planId,
          taskId: task.id,
          attempt,
        }),
      );

      plan = withTaskUpdate(plan, task.id, {
        status: "correcting",
        validationAttempts: attempt,
        validationErrors: errors,
      });
      updatePlan(deps.rootDir, plan);

      const correctionPrompt = buildCorrectionPrompt(
        task,
        diff,
        result.verdict,
        attempt,
      );

      let correctionResult;
      try {
        correctionResult = await dispatch(
          {
            rootDir: deps.rootDir,
            adapter: deps.adapter,
            onEvent: deps.onEvent,
            maxConcurrent: deps.maxConcurrent,
          },
          deps.agent,
          correctionPrompt,
        );
      } catch {
        // Correction dispatch failure — escalate rather than propagating,
        // so the user can retry via `telesis plan retry`.
        break;
      }

      correctionSessionIds.push(correctionResult.sessionId);
      lastSessionId = correctionResult.sessionId;
    }
  }

  // All retries exhausted — escalate
  deps.onEvent?.(
    createEvent("validation:escalated", {
      planId,
      taskId: task.id,
      attempt: lastAttempt,
    }),
  );

  plan = withTaskUpdate(plan, task.id, {
    status: "escalated",
    validationAttempts: lastAttempt,
    validationErrors: lastErrors,
    correctionSessionIds:
      correctionSessionIds.length > 0 ? correctionSessionIds : undefined,
  });
  plan = {
    ...plan,
    status: "escalated",
    error: `Task "${task.id}" escalated after ${lastAttempt} validation attempt(s)`,
  };
  updatePlan(deps.rootDir, plan);

  return { plan, passed: false };
};

/** Execute an approved plan by dispatching tasks in topological order */
export const executePlan = async (
  deps: ExecutorDeps,
  plan: Plan,
): Promise<ExecutionResult> => {
  const RESUMABLE_STATUSES = new Set([
    "approved",
    "failed",
    "executing",
    "escalated",
  ]);
  if (!RESUMABLE_STATUSES.has(plan.status)) {
    throw new Error(
      `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "approved", "failed", "escalated", or "executing"`,
    );
  }

  const sortResult = topologicalSort(plan.tasks);
  if (!sortResult.valid) {
    throw new Error(`Invalid plan dependency graph: ${sortResult.error}`);
  }

  const startTime = Date.now();
  const validationEnabled =
    deps.modelClient !== undefined &&
    (deps.validationConfig?.maxRetries ?? DEFAULT_MAX_RETRIES) > 0;

  // Normalize any in-progress tasks from a prior crash back to 'pending'
  const resetStatuses = new Set(["running", "validating", "correcting"]);
  const normalizedTasks = plan.tasks.map((t) =>
    resetStatuses.has(t.status) ? { ...t, status: "pending" as const } : t,
  );
  // Also reset escalated tasks on resume so they get re-executed
  const resumedTasks = normalizedTasks.map((t) =>
    t.status === "escalated" ? { ...t, status: "pending" as const } : t,
  );

  // Transition plan to executing, clearing stale fields from previous runs
  // Preserve original startedAt on resume so duration reporting is accurate
  let currentPlan: Plan = {
    ...plan,
    tasks: resumedTasks,
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

    // Skip already completed or skipped tasks (crash recovery)
    if (task.status === "completed" || task.status === "skipped") continue;

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

    // Capture git ref before dispatch for validation diff.
    // Outside the dispatch try/catch so git failures propagate directly
    // rather than being absorbed by failTask.
    let preRef: string | undefined;
    if (validationEnabled) {
      try {
        preRef = captureRef(deps.rootDir);
      } catch (refErr) {
        const msg = refErr instanceof Error ? refErr.message : "unknown error";
        throw new Error(
          `git ref capture failed (use --no-validate to skip validation): ${msg}`,
        );
      }
    }

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
        // Validation loop (if enabled and ref captured)
        if (validationEnabled && preRef) {
          const validationOutcome = await validateCorrectLoop(
            deps,
            currentPlan,
            task,
            preRef,
            result.sessionId,
          );
          currentPlan = validationOutcome.plan;

          if (validationOutcome.passed) {
            completedCount++;
            deps.onEvent?.(
              createEvent("plan:task:completed", {
                planId: plan.id,
                taskId,
                title: task.title,
              }),
            );
          } else {
            // Escalated — stop execution
            return {
              planId: plan.id,
              status: "escalated",
              completedTasks: completedCount,
              totalTasks: plan.tasks.length,
              durationMs: Date.now() - startTime,
            };
          }
        } else {
          // No validation — mark completed directly
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
        }
      } else {
        // Dispatch returned non-completed status
        currentPlan = failTask(
          deps,
          currentPlan,
          taskId,
          task.title,
          result.sessionId,
          "dispatch returned non-completed status",
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

      currentPlan = failTask(
        deps,
        currentPlan,
        taskId,
        task.title,
        undefined,
        errorMessage,
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

  // All tasks completed — check for milestone gate
  const enableGates = deps.validationConfig?.enableGates === true;
  if (enableGates) {
    currentPlan = {
      ...currentPlan,
      status: "awaiting_gate",
    };
    updatePlan(deps.rootDir, currentPlan);

    deps.onEvent?.(
      createEvent("plan:awaiting_gate", {
        planId: plan.id,
        workItemId: plan.workItemId,
        title: plan.title,
      }),
    );

    return {
      planId: plan.id,
      status: "awaiting_gate",
      completedTasks: completedCount,
      totalTasks: plan.tasks.length,
      durationMs: Date.now() - startTime,
    };
  }

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
