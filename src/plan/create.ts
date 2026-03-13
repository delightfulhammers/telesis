import { randomUUID } from "node:crypto";
import type { ModelClient } from "../agent/model/client.js";
import type { WorkItem } from "../intake/types.js";
import { planWorkItem } from "./planner.js";
import { createPlan as storePlan } from "./store.js";
import type { Plan } from "./types.js";

/** Create a plan from a work item via LLM decomposition */
export const createPlanFromWorkItem = async (
  client: ModelClient,
  rootDir: string,
  workItem: WorkItem,
  model?: string,
  maxTasks?: number,
): Promise<Plan> => {
  const result = await planWorkItem(client, rootDir, workItem, model, maxTasks);

  const plan: Plan = {
    id: randomUUID(),
    workItemId: workItem.id,
    title: workItem.title,
    status: "draft",
    tasks: result.tasks,
    createdAt: new Date().toISOString(),
    model: result.model,
    tokenUsage: result.tokenUsage,
  };

  storePlan(rootDir, plan);
  return plan;
};
