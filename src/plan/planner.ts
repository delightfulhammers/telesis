import type { ModelClient } from "../agent/model/client.js";
import type { WorkItem } from "../intake/types.js";
import {
  assembleDispatchContext,
  formatContextPrompt,
} from "../dispatch/context.js";
import { parseJsonResponse } from "../agent/review/json-parse.js";
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from "./prompts.js";
import { validatePlanTasks, topologicalSort } from "./validate.js";
import type { PlanTask } from "./types.js";

/** Result of an LLM-based work item decomposition */
export interface PlannerResult {
  readonly tasks: readonly PlanTask[];
  readonly model?: string;
  readonly durationMs: number;
  readonly tokenUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

interface RawTask {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly description?: unknown;
  readonly dependsOn?: unknown;
}

/** Normalize raw LLM output into typed PlanTask objects */
const normalizeTasks = (raw: unknown): readonly PlanTask[] => {
  if (!Array.isArray(raw)) {
    throw new Error("Planner response is not an array");
  }

  return raw.map((item: RawTask, index: number) => {
    const id =
      typeof item.id === "string" && item.id.length > 0
        ? item.id
        : `task-${index + 1}`;

    const title =
      typeof item.title === "string" ? item.title : `Task ${index + 1}`;

    const description =
      typeof item.description === "string" ? item.description : "";

    const dependsOn = Array.isArray(item.dependsOn)
      ? item.dependsOn.filter(
          (d: unknown): d is string => typeof d === "string",
        )
      : [];

    return {
      id,
      title,
      description,
      dependsOn,
      status: "pending" as const,
    };
  });
};

/** Decompose a work item into tasks via LLM */
export const planWorkItem = async (
  client: ModelClient,
  rootDir: string,
  workItem: WorkItem,
  model?: string,
  maxTasks?: number,
): Promise<PlannerResult> => {
  const ctx = assembleDispatchContext(rootDir);
  const contextPrompt = formatContextPrompt(ctx);
  const systemPrompt = buildPlannerSystemPrompt(contextPrompt, maxTasks);
  const userPrompt = buildPlannerUserPrompt(workItem);

  const response = await client.complete({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = parseJsonResponse(response.content);
  const tasks = normalizeTasks(parsed);

  const errors = validatePlanTasks(tasks);
  if (errors.length > 0) {
    throw new Error(
      `Planner produced invalid tasks:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  const sortResult = topologicalSort(tasks);
  if (!sortResult.valid) {
    throw new Error(
      `Planner produced invalid dependency graph: ${sortResult.error}`,
    );
  }

  return {
    tasks,
    model,
    durationMs: response.durationMs,
    tokenUsage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    },
  };
};
