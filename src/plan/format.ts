import type { Plan, PlanTask } from "./types.js";

const padRight = (s: string, len: number): string =>
  s.length >= len ? s : s + " ".repeat(len - s.length);

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;

/** Status indicator symbols for task display */
const taskStatusIcon = (status: string): string => {
  switch (status) {
    case "completed":
      return "[x]";
    case "running":
      return "[>]";
    case "failed":
      return "[!]";
    case "skipped":
      return "[-]";
    default:
      return "[ ]";
  }
};

/** Format a list of plans as a table */
export const formatPlanList = (plans: readonly Plan[]): string => {
  if (plans.length === 0) return "No plans.";

  const lines = plans.map((plan) => {
    const id = plan.id.slice(0, 8);
    const status = padRight(plan.status, 10);
    const tasks = `${plan.tasks.filter((t) => t.status === "completed").length}/${plan.tasks.length}`;
    const date = plan.createdAt.slice(0, 19).replace("T", " ");
    const title = truncate(plan.title, 50);
    return `${id}  ${status}  ${padRight(tasks, 6)}  ${date}  ${title}`;
  });

  const header = `${"ID".padEnd(8)}  ${"STATUS".padEnd(10)}  ${"TASKS".padEnd(6)}  ${"CREATED".padEnd(19)}  TITLE`;
  return [header, ...lines].join("\n");
};

/** Format a task line for the plan detail view */
const formatTaskLine = (task: PlanTask, indent: number = 0): string => {
  const prefix = " ".repeat(indent);
  const icon = taskStatusIcon(task.status);
  const deps =
    task.dependsOn.length > 0 ? ` (after: ${task.dependsOn.join(", ")})` : "";
  return `${prefix}${icon} ${task.id}: ${task.title}${deps}`;
};

/** Format a single plan detail view */
export const formatPlanDetail = (plan: Plan): string => {
  const lines = [
    `ID:        ${plan.id}`,
    `Title:     ${plan.title}`,
    `Work Item: ${plan.workItemId}`,
    `Status:    ${plan.status}`,
    `Created:   ${plan.createdAt}`,
    plan.approvedAt ? `Approved:  ${plan.approvedAt}` : null,
    plan.startedAt ? `Started:   ${plan.startedAt}` : null,
    plan.completedAt ? `Completed: ${plan.completedAt}` : null,
    plan.error ? `Error:     ${plan.error}` : null,
    plan.model ? `Model:     ${plan.model}` : null,
    plan.tokenUsage
      ? `Tokens:    ${plan.tokenUsage.inputTokens} in / ${plan.tokenUsage.outputTokens} out`
      : null,
    "",
    `Tasks (${plan.tasks.filter((t) => t.status === "completed").length}/${plan.tasks.length} complete):`,
    ...plan.tasks.map((t) => formatTaskLine(t, 2)),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return lines;
};
