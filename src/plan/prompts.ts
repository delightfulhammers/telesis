import { randomUUID } from "node:crypto";
import type { WorkItem } from "../intake/types.js";

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 4000;
const MAX_LABELS_LENGTH = 500;
const MAX_CONTEXT_LENGTH = 8000;

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen) + "\n\n[...truncated]" : text;

/** Build the system prompt for the planner agent */
export const buildPlannerSystemPrompt = (
  contextPrompt: string,
  maxTasks?: number,
): string => {
  const taskLimit = maxTasks ?? 10;

  return [
    truncate(contextPrompt, MAX_CONTEXT_LENGTH),
    "",
    "---",
    "",
    "## Your Role: Task Planner",
    "",
    "You are a task planning agent. Your job is to decompose a work item (typically a GitHub issue)",
    "into a sequence of smaller, concrete tasks that a coding agent can execute one at a time.",
    "",
    "## Output Format",
    "",
    "Respond with ONLY a JSON array of task objects. No preamble, no explanation, no markdown.",
    "",
    "Each task object must have these fields:",
    '- `id`: A short slug like "task-1", "task-2", etc. Use sequential numbering.',
    '- `title`: A brief, imperative title (e.g. "Add validation to user input handler")',
    "- `description`: Detailed instructions for the coding agent. Include:",
    "  - What files to create or modify",
    "  - What the expected behavior should be",
    "  - Any edge cases to handle",
    "  - Testing requirements",
    "- `dependsOn`: Array of task IDs this task depends on. Use `[]` for tasks with no dependencies.",
    "",
    "## Guidelines",
    "",
    `- Produce between 1 and ${taskLimit} tasks. Prefer fewer, well-scoped tasks over many tiny ones.`,
    "- Each task should be completable by a coding agent in a single session.",
    "- Tasks should be ordered so dependencies are respected — a task's dependencies must come before it.",
    "- The first task should have no dependencies (`dependsOn: []`).",
    "- Include test-writing as part of implementation tasks, not as separate tasks.",
    "- Be specific about file paths and function names when the project context allows it.",
    "- Do NOT include deployment, documentation updates, or version bumps as tasks.",
    "- Focus on implementation: code changes, tests, and configuration.",
  ].join("\n");
};

/** Generate a fence UUID that does not appear in the content */
const generateFence = (content: string): string => {
  for (let i = 0; i < 10; i++) {
    const candidate = randomUUID();
    if (!content.includes(candidate)) return candidate;
  }
  return randomUUID();
};

/** Build the user prompt with fenced untrusted work item content */
export const buildPlannerUserPrompt = (workItem: WorkItem): string => {
  const title = truncate(
    workItem.title.replace(/[\r\n]+/g, " ").trim(),
    MAX_TITLE_LENGTH,
  );
  const body = truncate(workItem.body.trim(), MAX_BODY_LENGTH);

  // Strip fence-like patterns from untrusted content to prevent escape
  const stripFencePatterns = (s: string): string =>
    s.replace(/\[UNTRUSTED:[^\]]*\]/g, "[REDACTED]");

  const safeTitle = stripFencePatterns(title);
  const safeBody = stripFencePatterns(body);
  const allContent = `${safeTitle}\n${safeBody}`;
  const fence = generateFence(allContent);

  const sanitize = (s: string): string => s.replace(/[\r\n\[\]]/g, "").trim();

  const labelsLine =
    workItem.labels.length > 0
      ? `Labels: ${truncate(workItem.labels.map(sanitize).join(", "), MAX_LABELS_LENGTH)}`
      : null;
  const priorityLine = workItem.priority
    ? `Priority: ${sanitize(workItem.priority)}`
    : null;

  return [
    "Decompose the following work item into implementation tasks.",
    "",
    `[UNTRUSTED:${fence} START]`,
    `Title: ${safeTitle}`,
    "",
    safeBody,
    labelsLine,
    priorityLine,
    `[UNTRUSTED:${fence} END]`,
    "",
    "Respond with ONLY the JSON array of tasks.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
};
