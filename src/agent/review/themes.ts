import type { ModelClient } from "../model/client.js";
import type { TokenUsage } from "../model/types.js";
import type { ReviewFinding } from "./types.js";
import { listReviewSessions, loadReviewSession } from "./store.js";
import { buildThemeExtractionPrompt } from "./prompts.js";
import { parseJsonResponse } from "./json-parse.js";

const DEFAULT_MAX_SESSIONS = 3;
const MIN_FINDINGS_FOR_THEMES = 3;

export interface ThemeResult {
  readonly themes: readonly string[];
  readonly tokenUsage?: TokenUsage;
}

/**
 * Loads findings from the N most recent review sessions.
 */
const loadRecentFindings = (
  rootDir: string,
  maxSessions: number,
): readonly ReviewFinding[] => {
  const sessions = listReviewSessions(rootDir);
  const recent = sessions.slice(0, maxSessions);

  const findings: ReviewFinding[] = [];
  for (const session of recent) {
    try {
      const loaded = loadReviewSession(rootDir, session.id);
      findings.push(...loaded.findings);
    } catch {
      // skip unreadable sessions
    }
  }

  return findings;
};

const parseThemes = (content: string): readonly string[] => {
  try {
    const parsed = parseJsonResponse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
};

/**
 * Extracts themes from recent review sessions via an LLM call.
 * Returns an empty array if there are no prior sessions or insufficient
 * findings for meaningful theme extraction.
 */
export const extractThemes = async (
  rootDir: string,
  client: ModelClient,
  model: string,
  maxSessions: number = DEFAULT_MAX_SESSIONS,
): Promise<ThemeResult> => {
  const findings = loadRecentFindings(rootDir, maxSessions);

  if (findings.length < MIN_FINDINGS_FOR_THEMES) {
    return { themes: [] };
  }

  const summaries = findings.map((f) => ({
    severity: f.severity,
    category: f.category,
    path: f.path,
    description: f.description,
  }));

  try {
    const response = await client.complete({
      model,
      system:
        "You are a theme extraction engine. Return only valid JSON. No explanation.",
      messages: [
        { role: "user", content: buildThemeExtractionPrompt(summaries) },
      ],
    });

    const themes = parseThemes(response.content);
    return {
      themes,
      tokenUsage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    };
  } catch {
    console.error(
      "Warning: theme extraction failed, proceeding without themes.",
    );
    return { themes: [] };
  }
};
