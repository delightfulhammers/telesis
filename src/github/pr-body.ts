import type { Plan } from "../plan/types.js";
import type { WorkItem } from "../intake/types.js";
import type { ModelClient } from "../agent/model/client.js";
import type { RunResult } from "../pipeline/types.js";
import { boundDiff } from "../git/diff-utils.js";

/** Maximum diff characters sent to the model for PR body generation */
const MAX_DIFF_CHARS = 30_000;

const PR_BODY_SYSTEM = `You are a pull request description generator. Given a plan, work item, execution results, and a diff, produce a clear PR description in GitHub-flavored markdown.

Rules:
- Start with a one-sentence summary of what this PR does
- Include a "## Changes" section with bullet points describing the key changes
- Include a "## Plan" section listing the tasks that were executed
- If quality gate or review results are provided, include a "## Validation" section
- Reference the issue using "Resolves #N" format
- Keep it concise — under 500 words
- Do not include the raw diff in the PR description
- Output ONLY the markdown PR body, nothing else`;

/** Generate a deterministic PR body from plan + work item metadata */
export const generatePRBody = (
  plan: Plan,
  workItem: WorkItem,
  result: RunResult,
): string => {
  const taskList = plan.tasks.map((t) => `- [x] ${t.title}`).join("\n");

  const issueRef =
    workItem.source === "github"
      ? `Resolves #${workItem.sourceId}`
      : `Work item: ${workItem.id.slice(0, 8)}`;

  const lines = [
    issueRef,
    "",
    `## Plan: ${plan.title}`,
    "",
    taskList,
    "",
    `Tasks: ${plan.tasks.length}`,
  ];

  if (result.qualityGateSummary?.ran) {
    const passedCount = result.qualityGateSummary.results.filter(
      (r) => r.passed,
    ).length;
    lines.push(
      `Quality gates: ${passedCount}/${result.qualityGateSummary.results.length} passed`,
    );
  }

  if (result.reviewSummary?.ran) {
    const rs = result.reviewSummary;
    lines.push(
      `Review: ${rs.passed ? "passed" : "blocked"} (${rs.totalFindings} findings, ${rs.blockingFindings} blocking)`,
    );
  }

  return lines.join("\n");
};

/** Build the user prompt for LLM PR body generation */
const buildPRBodyPrompt = (
  diff: string,
  plan: Plan,
  workItem: WorkItem,
  result: RunResult,
): string => {
  const taskList = plan.tasks
    .map((t) => `- ${t.title} (${t.status})`)
    .join("\n");

  const sections = [
    `## Work Item`,
    `Title: ${workItem.title}`,
    `Body: ${(workItem.body ?? "").slice(0, 200)}`,
    ...(workItem.source === "github"
      ? [`GitHub issue: #${workItem.sourceId}`]
      : []),
    `## Plan`,
    `Title: ${plan.title}`,
    `Tasks:`,
    taskList,
  ];

  if (result.qualityGateSummary?.ran) {
    const gateLines = result.qualityGateSummary.results
      .map(
        (r) =>
          `- ${r.gate}: ${r.passed ? "passed" : "failed"}${r.error ? ` (${r.error})` : ""}`,
      )
      .join("\n");
    sections.push("", `## Quality Gates`, gateLines);
  }

  if (result.reviewSummary?.ran) {
    const rs = result.reviewSummary;
    sections.push(
      "",
      `## Review Results`,
      `Passed: ${rs.passed}`,
      `Total findings: ${rs.totalFindings}`,
      `Blocking: ${rs.blockingFindings}`,
      `Threshold: ${rs.threshold}`,
    );
  }

  sections.push("", `## Diff`, "```", boundDiff(diff, MAX_DIFF_CHARS), "```");

  return sections.join("\n");
};

/**
 * Generate a PR body using the LLM, falling back to deterministic
 * template if the call fails.
 */
export const generateLLMPRBody = async (
  client: ModelClient,
  diff: string,
  plan: Plan,
  workItem: WorkItem,
  result: RunResult,
): Promise<string> => {
  try {
    const response = await client.complete({
      system: PR_BODY_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPRBodyPrompt(diff, plan, workItem, result),
        },
      ],
      maxTokens: 1024,
    });

    const body = response.content.trim();
    if (body.length === 0) {
      return generatePRBody(plan, workItem, result);
    }

    return body;
  } catch {
    return generatePRBody(plan, workItem, result);
  }
};
