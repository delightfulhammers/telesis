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

const MAX_DESCRIPTION_LENGTH = 300;
const MAX_SUGGESTION_LENGTH = 300;
const MAX_NOTE_LENGTH = 100;

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : s.slice(0, max) + "…";

const buildJudgePrompt = (
  finding: ReviewFinding,
  matchingDismissals: readonly Dismissal[],
): string => {
  // Dismissal descriptions and notes may originate from untrusted sources
  // (e.g., GitHub PR comments imported via sync-dismissals). Truncate to
  // limit prompt injection surface.
  const dismissalDescriptions = matchingDismissals
    .map(
      (d, i) =>
        `Dismissal ${i + 1}:\n  Description: ${truncate(d.description, MAX_DESCRIPTION_LENGTH)}\n  Reason: ${d.reason}${d.note ? `\n  Note: ${truncate(d.note, MAX_NOTE_LENGTH)}` : ""}`,
    )
    .join("\n\n");

  return `You are a code review finding deduplication judge. Determine whether the following new finding is substantively the same concern as the dismissed finding(s).

New finding:
  Path: ${finding.path}
  Category: ${finding.category}
  Description: ${truncate(finding.description, 500)}
  Suggestion: ${truncate(finding.suggestion, MAX_SUGGESTION_LENGTH)}

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

  // Partition findings into those needing the judge and those that skip it
  const needsJudge: { finding: ReviewFinding; candidates: Dismissal[] }[] = [];
  const noOverlap: ReviewFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.path}::${finding.category}`;
    const candidates = dismissalsByPathCategory.get(key);
    if (candidates && candidates.length > 0) {
      needsJudge.push({ finding, candidates });
    } else {
      noOverlap.push(finding);
    }
  }

  // Run judge calls in parallel with bounded concurrency
  const CONCURRENCY = 5;
  const judgeOne = async ({
    finding,
    candidates,
  }: {
    finding: ReviewFinding;
    candidates: Dismissal[];
  }) => {
    const prompt = buildJudgePrompt(finding, candidates);
    try {
      const response = await client.complete({
        model,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 128,
      });
      return {
        finding,
        filtered: parseJudgeResponse(response.content),
        usage: response.usage,
      };
    } catch (err) {
      console.error(
        `  Judge error for ${finding.id}, keeping finding:`,
        err instanceof Error ? err.message : err,
      );
      return {
        finding,
        filtered: false,
        usage: { inputTokens: 0, outputTokens: 0 } as TokenUsage,
      };
    }
  };

  type JudgeOneResult = Awaited<ReturnType<typeof judgeOne>>;
  const judgeResults: JudgeOneResult[] = [];
  for (let i = 0; i < needsJudge.length; i += CONCURRENCY) {
    const chunk = needsJudge.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(judgeOne));
    judgeResults.push(...chunkResults);
  }

  const passed: ReviewFinding[] = [...noOverlap];
  const filteredIds: string[] = [];
  let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (const result of judgeResults) {
    totalUsage = addUsage(totalUsage, result.usage);
    if (result.filtered) {
      filteredIds.push(result.finding.id);
      console.error(
        `  Filtered (LLM judge): ${result.finding.path} [${result.finding.category}] — ${result.finding.id}`,
      );
    } else {
      passed.push(result.finding);
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
