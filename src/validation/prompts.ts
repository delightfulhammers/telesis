import { randomUUID } from "node:crypto";
import type { PlanTask } from "../plan/types.js";

const MAX_TASK_DESC_LENGTH = 4000;
const MAX_DIFF_LENGTH = 100_000;
const MAX_SUMMARY_LENGTH = 30_000;

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen) + "\n\n[...truncated]" : text;

/** Generate a fence UUID that does not appear in the content */
const generateFence = (content: string): string => {
  for (let i = 0; i < 10; i++) {
    const candidate = randomUUID();
    if (!content.includes(candidate)) return candidate;
  }
  return randomUUID();
};

/** Strip fence-like patterns from untrusted content to prevent escape */
const stripFencePatterns = (s: string): string =>
  s.replace(/\[UNTRUSTED:[^\]]*\]/g, "[REDACTED]");

/** Build the system prompt for the validation agent */
export const buildValidationSystemPrompt = (contextPrompt: string): string =>
  [
    truncate(contextPrompt, 8000),
    "",
    "---",
    "",
    "## Your Role: Task Verification Agent",
    "",
    "You are a verification agent. Your job is to determine whether a coding agent's work",
    "meets the requirements specified in a task description.",
    "",
    "You will be given:",
    "1. A task description with requirements",
    "2. A git diff showing the code changes made",
    "3. A summary of the agent's session (actions taken)",
    "",
    "## Instructions",
    "",
    "- Extract each distinct requirement or criterion from the task description.",
    "- For each criterion, determine whether the git diff and session evidence show it was met.",
    "- Be strict: a criterion is only `met: true` if the evidence clearly shows completion.",
    "- Be fair: if the task says to create a file and the diff shows that file was created with",
    "  the expected content, that criterion is met.",
    "- If the diff is empty or minimal relative to the task scope, most criteria are likely unmet.",
    "",
    "## Output Format",
    "",
    "Respond with ONLY a JSON object. No preamble, no explanation, no markdown.",
    "",
    "```",
    "{",
    '  "passed": boolean,        // true only if ALL criteria are met',
    '  "criteria": [',
    "    {",
    '      "criterion": string,  // what was required',
    '      "met": boolean,       // whether evidence shows it was done',
    '      "evidence": string    // brief explanation of why met or not',
    "    }",
    "  ],",
    '  "summary": string         // one-sentence overall assessment',
    "}",
    "```",
  ].join("\n");

/** Build the user prompt with fenced untrusted task content */
export const buildValidationUserPrompt = (
  task: PlanTask,
  diff: string,
  sessionSummary: string,
): string => {
  const safeTitle = stripFencePatterns(task.title);
  const safeDescription = stripFencePatterns(
    truncate(task.description, MAX_TASK_DESC_LENGTH),
  );
  const safeDiff = stripFencePatterns(truncate(diff, MAX_DIFF_LENGTH));
  const safeSummary = stripFencePatterns(
    truncate(sessionSummary, MAX_SUMMARY_LENGTH),
  );

  // Include all injected content in collision check so the fence UUID
  // cannot appear anywhere in the prompt
  const allContent = `${safeTitle}\n${safeDescription}\n${safeDiff}\n${safeSummary}`;
  const fence = generateFence(allContent);

  return [
    "Verify whether the following task was completed correctly.",
    "",
    `[UNTRUSTED:${fence} START]`,
    `Task ID: ${task.id}`,
    `Title: ${safeTitle}`,
    "",
    safeDescription,
    "",
    "## Git Diff (changes made)",
    "",
    "```diff",
    safeDiff || "(no changes detected)",
    "```",
    "",
    "## Session Summary (agent actions)",
    "",
    safeSummary || "(no session events)",
    `[UNTRUSTED:${fence} END]`,
    "",
    "Respond with ONLY the JSON verdict.",
  ].join("\n");
};
