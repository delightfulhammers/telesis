import type { ReviewSession } from "./types.js";
import type { ModelCallRecord } from "../telemetry/types.js";
import { loadPricing, calculateCost } from "../telemetry/pricing.js";

/**
 * Derives estimated cost from a review session's token usage using
 * the project's pricing config. Returns null if pricing is unavailable.
 */
export const deriveCostFromSession = (
  session: ReviewSession,
  rootDir: string,
): number | null => {
  const pricing = loadPricing(rootDir);
  if (!pricing) return null;

  const record: ModelCallRecord = {
    id: "synthetic",
    timestamp: session.timestamp,
    component: "review",
    model: session.model,
    provider: "anthropic",
    inputTokens: session.tokenUsage.inputTokens,
    outputTokens: session.tokenUsage.outputTokens,
    cacheReadTokens: session.tokenUsage.cacheReadTokens,
    cacheWriteTokens: session.tokenUsage.cacheWriteTokens,
    durationMs: session.durationMs,
    sessionId: session.id,
  };

  return calculateCost([record], pricing);
};
