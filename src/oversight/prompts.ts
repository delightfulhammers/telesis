import type { DispatchContext } from "../dispatch/context.js";
import type { PolicyFile } from "./types.js";

const MAX_SYSTEM_PROMPT_CHARS = 8000;

const OUTPUT_FORMAT_FINDINGS = `
## Output Format

Respond with ONLY a JSON array of findings. No markdown fences, no preamble.
Each finding is an object with:
- "severity": "info" | "warning" | "critical"
- "summary": A one-line description of the issue (max 120 chars)
- "detail": A brief explanation of why this is a problem and what to do about it

If there are no issues, respond with an empty array: []

Do NOT hallucinate issues. Only report problems you can clearly identify from the event digest.
Do NOT report style preferences, minor nitpicks, or speculative concerns.
Only report issues that would materially affect correctness, security, or maintainability.
`.trim();

const OUTPUT_FORMAT_NOTES = `
## Output Format

Respond with ONLY a JSON array of notes. No markdown fences, no preamble.
Each note is an object with:
- "text": A concise insight (max 200 chars) capturing the decision, pattern, or gotcha
- "tags": An array of 1-3 descriptive tags (e.g., "pattern", "decision", "gotcha", "architecture")

If the session contains no notable insights, respond with an empty array: []

Do NOT fabricate insights. Only extract observations that are clearly supported by the session events.
Focus on decisions made, patterns observed, and gotchas encountered — not routine actions.
`.trim();

/** Build the reviewer system prompt */
export const buildReviewerPrompt = (
  policy: PolicyFile,
  context: DispatchContext,
): string => {
  const sections: string[] = [];

  if (policy.systemPrompt.length > 0) {
    sections.push(policy.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS));
  }

  sections.push(`## Role

You are the Reviewer observer for the ${context.projectName} project (${context.primaryLanguage}).
You monitor a coding agent's actions in real time by analyzing event digests from the session.
Your job is to identify code quality issues, bugs, security vulnerabilities, and correctness
problems in the agent's work as it happens.`);

  if (context.conventions.length > 0) {
    sections.push(
      "## Project Conventions\n\n" + context.conventions.slice(0, 4000),
    );
  }

  if (context.activeMilestone.length > 0) {
    sections.push(
      "## Active Milestone\n\n" + context.activeMilestone.slice(0, 2000),
    );
  }

  sections.push(OUTPUT_FORMAT_FINDINGS);

  return sections.join("\n\n");
};

/** Build the architect system prompt */
export const buildArchitectPrompt = (
  policy: PolicyFile,
  context: DispatchContext,
): string => {
  const sections: string[] = [];

  if (policy.systemPrompt.length > 0) {
    sections.push(policy.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS));
  }

  sections.push(`## Role

You are the Architect observer for the ${context.projectName} project (${context.primaryLanguage}).
You monitor a coding agent's actions to detect spec drift — deviations from the project's
architecture, milestone acceptance criteria, and architectural decisions.
Flag only clear violations, not stylistic disagreements.`);

  if (context.architecture.length > 0) {
    sections.push("## Architecture\n\n" + context.architecture.slice(0, 6000));
  }

  if (context.activeMilestone.length > 0) {
    sections.push(
      "## Active Milestone\n\n" + context.activeMilestone.slice(0, 3000),
    );
  }

  if (context.activeAdrs.length > 0) {
    sections.push(
      "## Architectural Decisions\n\n" + context.activeAdrs.slice(0, 3000),
    );
  }

  sections.push(OUTPUT_FORMAT_FINDINGS);

  return sections.join("\n\n");
};

/** Build the chronicler system prompt */
export const buildChroniclerPrompt = (
  policy: PolicyFile,
  context: DispatchContext,
): string => {
  const sections: string[] = [];

  if (policy.systemPrompt.length > 0) {
    sections.push(policy.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS));
  }

  sections.push(`## Role

You are the Chronicler for the ${context.projectName} project (${context.primaryLanguage}).
You analyze a completed coding session transcript to extract development insights —
decisions made, patterns observed, gotchas encountered, and lessons learned.
These notes become part of the project's institutional memory.

Focus on insights that would help a developer working on this project in the future.
Do not describe routine actions (file reads, standard edits). Extract the WHY, not the WHAT.`);

  if (context.activeMilestone.length > 0) {
    sections.push(
      "## Active Milestone\n\n" + context.activeMilestone.slice(0, 2000),
    );
  }

  sections.push(OUTPUT_FORMAT_NOTES);

  return sections.join("\n\n");
};
