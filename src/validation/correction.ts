import { randomUUID } from "node:crypto";
import type { PlanTask } from "../plan/types.js";
import type { ValidationVerdict } from "./types.js";

const MAX_DIFF_LENGTH = 50_000;
const MAX_TASK_DESC_LENGTH = 4000;

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen) + "\n\n[...truncated]" : text;

/** Strip newlines from titles to prevent instruction injection */
const sanitizeTitle = (title: string): string =>
  title.replace(/[\r\n]+/g, " ").trim();

/** Strip fence-like patterns from untrusted content to prevent escape */
const stripFencePatterns = (s: string): string =>
  s.replace(/\[UNTRUSTED:[^\]]*\]/g, "[REDACTED]");

/** Generate a fence UUID that does not appear in the content */
const generateFence = (content: string): string => {
  for (let i = 0; i < 10; i++) {
    const candidate = randomUUID();
    if (!content.includes(candidate)) return candidate;
  }
  return randomUUID();
};

/** Build a correction prompt for a task that failed validation */
export const buildCorrectionPrompt = (
  task: PlanTask,
  diff: string,
  verdict: ValidationVerdict,
  attempt: number,
): string => {
  const failedCriteria = verdict.criteria.filter((c) => !c.met);

  const failureList = failedCriteria
    .map(
      (c, i) =>
        `${i + 1}. **${c.criterion}**\n   Evidence: ${c.evidence || "No evidence found"}`,
    )
    .join("\n");

  const safeTitle = sanitizeTitle(stripFencePatterns(task.title));
  const safeDescription = stripFencePatterns(
    truncate(task.description, MAX_TASK_DESC_LENGTH),
  );
  const safeDiff = stripFencePatterns(truncate(diff, MAX_DIFF_LENGTH));

  const allContent = `${safeTitle}\n${safeDescription}\n${safeDiff}`;
  const fence = generateFence(allContent);

  return [
    `# Correction Required (attempt ${attempt})`,
    "",
    `You are correcting task "${task.id}" from a larger plan.`,
    "",
    `[UNTRUSTED:${fence} START]`,
    "## Original Task",
    "",
    `**Title:** ${safeTitle}`,
    "",
    safeDescription,
    "",
    "## What Was Done",
    "",
    "The previous attempt made the following changes:",
    "",
    "```diff",
    safeDiff || "(no changes detected)",
    "```",
    `[UNTRUSTED:${fence} END]`,
    "",
    "## Validation Failures",
    "",
    `The validator found ${failedCriteria.length} unmet requirement(s):`,
    "",
    failureList,
    "",
    `Validator summary: ${verdict.summary}`,
    "",
    "## Instructions",
    "",
    "Fix ONLY the failing criteria listed above. Do not undo work that already passes.",
    "The existing changes in the diff are already applied to the codebase.",
    "Focus on the specific failures and address each one.",
  ].join("\n");
};
