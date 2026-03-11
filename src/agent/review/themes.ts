import type { ModelClient } from "../model/client.js";
import type { TokenUsage } from "../model/types.js";
import type { ReviewFinding, ThemeConclusion } from "./types.js";
import { listReviewSessions, loadReviewSession } from "./store.js";
import { buildThemeExtractionPrompt } from "./prompts.js";
import { parseJsonResponse } from "./json-parse.js";

const DEFAULT_MAX_SESSIONS = 3;
const MIN_FINDINGS_FOR_THEMES = 3;

export interface ThemeResult {
  readonly themes: readonly string[];
  readonly conclusions: readonly ThemeConclusion[];
  readonly tokenUsage?: TokenUsage;
}

/**
 * Loads findings from the N most recent review sessions.
 */
export const loadRecentFindings = (
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

const isThemeConclusion = (v: unknown): v is ThemeConclusion =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Record<string, unknown>).theme === "string" &&
  typeof (v as Record<string, unknown>).conclusion === "string" &&
  typeof (v as Record<string, unknown>).antiPattern === "string";

interface StructuredThemeResponse {
  readonly themes: readonly string[];
  readonly conclusions: readonly ThemeConclusion[];
}

const parseStructuredThemes = (content: string): StructuredThemeResponse => {
  try {
    const parsed = parseJsonResponse(content);

    // New structured format: { themes: string[], conclusions: ThemeConclusion[] }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const obj = parsed as Record<string, unknown>;
      const themes = Array.isArray(obj.themes)
        ? (obj.themes as unknown[]).filter(
            (t): t is string => typeof t === "string",
          )
        : [];
      const conclusions = Array.isArray(obj.conclusions)
        ? (obj.conclusions as unknown[]).filter(isThemeConclusion)
        : [];
      return { themes, conclusions };
    }

    // Fallback: old format — bare array of theme strings
    if (Array.isArray(parsed)) {
      const themes = (parsed as unknown[]).filter(
        (t): t is string => typeof t === "string",
      );
      return { themes, conclusions: [] };
    }

    return { themes: [], conclusions: [] };
  } catch {
    return { themes: [], conclusions: [] };
  }
};

/**
 * Extracts themes from recent review sessions via an LLM call.
 * Returns structured conclusions alongside bare theme strings.
 * Falls back to bare themes if the model doesn't return structured output.
 */
export const extractThemes = async (
  rootDir: string,
  client: ModelClient,
  model: string,
  maxSessions: number = DEFAULT_MAX_SESSIONS,
): Promise<ThemeResult> => {
  const findings = loadRecentFindings(rootDir, maxSessions);

  if (findings.length < MIN_FINDINGS_FOR_THEMES) {
    return { themes: [], conclusions: [] };
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

    const result = parseStructuredThemes(response.content);
    return {
      ...result,
      tokenUsage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    };
  } catch {
    console.error(
      "Warning: theme extraction failed, proceeding without themes.",
    );
    return { themes: [], conclusions: [] };
  }
};
