import type { ReviewFinding } from "../types.js";
import type { Dismissal } from "./types.js";
import type { ModelClient } from "../../model/client.js";
import type { TokenUsage } from "../../model/types.js";

export interface JudgeResult {
  readonly findings: readonly ReviewFinding[];
  readonly filteredCount: number;
  readonly filteredIds: readonly string[];
  readonly tokenUsage?: TokenUsage;
}

const buildJudgePrompt = (
  finding: ReviewFinding,
  matchingDismissals: readonly Dismissal[],
): string => {
  const dismissalDescriptions = matchingDismissals
    .map(
      (d, i) =>
        `Dismissal ${i + 1}:\n  Description: ${d.description}\n  Reason: ${d.reason}${d.note ? `\n  Note: ${d.note}` : ""}`,
    )
    .join("\n\n");

  return `You are a code review finding deduplication judge. Determine whether the following new finding is substantively the same concern as the dismissed finding(s).

New finding:
  Path: ${finding.path}
  Category: ${finding.category}
  Description: ${finding.description}
  Suggestion: ${finding.suggestion}

Previously dismissed finding(s):
${dismissalDescriptions}

Is this new finding substantively the same concern as the dismissed finding(s)? Answer YES or NO with a one-line rationale.`;
};

const parseJudgeResponse = (response: string): boolean => {
  const trimmed = response.trim().toUpperCase();
  return trimmed.startsWith("YES");
};

const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/**
 * LLM judge filter for semantic re-raise detection. After deterministic
 * matching, remaining findings that share path+category with any dismissal
 * are sent to a cheap/fast model for binary classification.
 *
 * Findings with no path+category overlap with dismissals skip the judge
 * entirely. On model failure, findings are kept (safe default).
 */
export const filterWithJudge = async (
  client: ModelClient,
  model: string,
  findings: readonly ReviewFinding[],
  dismissals: readonly Dismissal[],
): Promise<JudgeResult> => {
  if (dismissals.length === 0) {
    return { findings, filteredCount: 0, filteredIds: [] };
  }

  // Index dismissals by path+category
  const dismissalsByPathCategory = new Map<string, Dismissal[]>();
  for (const d of dismissals) {
    const key = `${d.path}::${d.category}`;
    const existing = dismissalsByPathCategory.get(key);
    if (existing) {
      existing.push(d);
    } else {
      dismissalsByPathCategory.set(key, [d]);
    }
  }

  const passed: ReviewFinding[] = [];
  const filteredIds: string[] = [];
  let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (const finding of findings) {
    const key = `${finding.path}::${finding.category}`;
    const candidates = dismissalsByPathCategory.get(key);

    // No overlap — skip judge, keep finding
    if (!candidates || candidates.length === 0) {
      passed.push(finding);
      continue;
    }

    // Ask the judge
    const prompt = buildJudgePrompt(finding, candidates);
    try {
      const response = await client.complete({
        model,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 128,
      });

      totalUsage = addUsage(totalUsage, response.usage);

      if (parseJudgeResponse(response.content)) {
        filteredIds.push(finding.id);
        console.error(
          `  Filtered (LLM judge): ${finding.path} [${finding.category}] — ${finding.id}`,
        );
      } else {
        passed.push(finding);
      }
    } catch (err) {
      // On failure, keep the finding (safe default)
      console.error(
        `  Judge error for ${finding.id}, keeping finding:`,
        err instanceof Error ? err.message : err,
      );
      passed.push(finding);
    }
  }

  return {
    findings: passed,
    filteredCount: filteredIds.length,
    filteredIds,
    tokenUsage:
      totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
        ? totalUsage
        : undefined,
  };
};
