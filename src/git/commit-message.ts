import type { Plan } from "../plan/types.js";
import type { WorkItem } from "../intake/types.js";
import type { ModelClient } from "../agent/model/client.js";
import { boundDiff } from "./diff-utils.js";

/** Maximum diff characters sent to the model for commit message generation */
const MAX_DIFF_CHARS = 20_000;

const COMMIT_MESSAGE_SYSTEM = `You are a commit message generator. Given a git diff, a plan, and a work item, produce a conventional commit message.

Rules:
- First line: type(scope): description — max 72 characters
- Use "feat" for new features, "fix" for bug fixes, "refactor" for restructuring, "docs" for documentation, "test" for tests only
- Blank line after subject
- Body: 2-4 bullet points explaining WHAT changed and WHY (not HOW — the diff shows how)
- If a GitHub issue reference is provided, include it in the subject line as (#N)
- Do not include any markdown formatting, backticks, or code blocks
- Output ONLY the commit message text, nothing else`;

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

/** Build the user prompt for LLM commit message generation */
const buildCommitPrompt = (
  diff: string,
  plan: Plan,
  workItem: WorkItem,
): string => {
  const taskList = plan.tasks.map((t) => `- ${t.title}`).join("\n");

  return [
    `## Work Item`,
    `Title: ${workItem.title}`,
    ...(workItem.source === "github"
      ? [`GitHub issue: #${workItem.sourceId}`]
      : []),
    "",
    `## Plan`,
    `Title: ${plan.title}`,
    `Tasks:`,
    taskList,
    "",
    `## Diff`,
    "```",
    boundDiff(diff, MAX_DIFF_CHARS),
    "```",
  ].join("\n");
};

/**
 * Generate a commit message using the LLM, falling back to deterministic
 * template if the call fails.
 */
export const generateLLMCommitMessage = async (
  client: ModelClient,
  diff: string,
  plan: Plan,
  workItem: WorkItem,
): Promise<string> => {
  try {
    const response = await client.complete({
      system: COMMIT_MESSAGE_SYSTEM,
      messages: [
        { role: "user", content: buildCommitPrompt(diff, plan, workItem) },
      ],
      maxTokens: 512,
    });

    const message = response.content.trim();
    if (message.length === 0) {
      return generateCommitMessage(plan, workItem);
    }

    return message;
  } catch {
    return generateCommitMessage(plan, workItem);
  }
};
