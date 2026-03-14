import type { Plan } from "../plan/types.js";
import type { WorkItem } from "../intake/types.js";

/**
 * Generate a deterministic commit message from plan + work item metadata.
 * No LLM call — the work item title (human-written) is the best summary.
 */
export const generateCommitMessage = (
  plan: Plan,
  workItem: WorkItem,
): string => {
  const issueRef =
    workItem.source === "github" ? ` (#${workItem.sourceId})` : "";

  const subject = `feat: ${workItem.title}${issueRef}`;

  const lines = [
    subject,
    "",
    `Plan: ${plan.title}`,
    `Work item: ${workItem.id.slice(0, 8)}`,
    `Tasks: ${plan.tasks.length}`,
  ];

  return lines.join("\n");
};
