import type { ModelClient } from "../agent/model/client.js";
import type { DispatchContext } from "../dispatch/context.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { parseJsonResponse } from "../agent/review/json-parse.js";
import { formatEventDigest } from "./format.js";
import { buildArchitectPrompt } from "./prompts.js";
import { parseFindings } from "./findings.js";
import type { AnalyzeFn, ObserverOutput, PolicyFile } from "./types.js";

/** Create an architect analyzer function */
export const createArchitectAnalyzer = (
  client: ModelClient,
  policy: PolicyFile,
  sessionId: string,
): AnalyzeFn => {
  const analyze: AnalyzeFn = async (
    events: readonly TelesisDaemonEvent[],
    context: DispatchContext,
  ): Promise<ObserverOutput> => {
    if (events.length === 0) return { findings: [], notes: [] };

    const system = buildArchitectPrompt(policy, context);
    const digest = formatEventDigest(events);

    const response = await client.complete({
      model: policy.model,
      system,
      messages: [{ role: "user", content: digest }],
      maxTokens: 4096,
    });

    try {
      const parsed = parseJsonResponse(response.content);
      if (!Array.isArray(parsed)) return { findings: [], notes: [] };

      const findings = parseFindings(
        parsed,
        "architect",
        sessionId,
        events.length,
      );
      return { findings, notes: [] };
    } catch {
      console.error(
        "oversight: architect could not parse model response as findings JSON.",
      );
      return { findings: [], notes: [] };
    }
  };

  return analyze;
};
