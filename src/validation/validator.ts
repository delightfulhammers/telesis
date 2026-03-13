import type { ModelClient } from "../agent/model/client.js";
import { parseJsonResponse } from "../agent/review/json-parse.js";
import {
  assembleDispatchContext,
  formatContextPrompt,
} from "../dispatch/context.js";
import type { PlanTask } from "../plan/types.js";
import {
  buildValidationSystemPrompt,
  buildValidationUserPrompt,
} from "./prompts.js";
import type {
  CriterionResult,
  ValidationResult,
  ValidationVerdict,
} from "./types.js";

/** Normalize a raw parsed criterion into a typed CriterionResult */
const normalizeCriterion = (raw: unknown): CriterionResult | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.criterion !== "string") return null;

  return {
    criterion: r.criterion,
    met: r.met === true,
    evidence: typeof r.evidence === "string" ? r.evidence : "",
  };
};

/** Normalize a raw parsed response into a typed ValidationVerdict */
const normalizeVerdict = (raw: unknown): ValidationVerdict => {
  if (!raw || typeof raw !== "object") {
    return { passed: false, criteria: [], summary: "Invalid response format" };
  }

  const r = raw as Record<string, unknown>;
  const criteria = Array.isArray(r.criteria)
    ? r.criteria
        .map(normalizeCriterion)
        .filter((c): c is CriterionResult => c !== null)
    : [];

  // A verdict with no parseable criteria is treated as failed — the LLM
  // must return at least one criterion for the verdict to pass.
  const passed =
    r.passed === true && criteria.length > 0 && criteria.every((c) => c.met);

  return {
    passed,
    criteria,
    summary: typeof r.summary === "string" ? r.summary : "",
  };
};

/** Validate a task's output against its description using an LLM */
export const validateTask = async (
  client: ModelClient,
  task: PlanTask,
  diff: string,
  sessionSummary: string,
  rootDir: string,
  model?: string,
): Promise<ValidationResult> => {
  const ctx = assembleDispatchContext(rootDir);
  const contextPrompt = formatContextPrompt(ctx);
  const systemPrompt = buildValidationSystemPrompt(contextPrompt);
  const userPrompt = buildValidationUserPrompt(task, diff, sessionSummary);

  const response = await client.complete({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = parseJsonResponse(response.content);
  const verdict = normalizeVerdict(parsed);

  return {
    verdict,
    model,
    durationMs: response.durationMs,
    tokenUsage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    },
  };
};
