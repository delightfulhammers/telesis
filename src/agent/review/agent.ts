import { randomUUID } from "node:crypto";
import type { ModelClient } from "../model/client.js";
import {
  SEVERITIES,
  type ChangedFile,
  type PersonaDefinition,
  type PersonaResult,
  type ReviewContext,
  type ReviewFinding,
  type Category,
  type Severity,
} from "./types.js";
import {
  buildSinglePassPrompt,
  buildPersonaSystemPrompt,
  buildUserMessage,
} from "./prompts.js";

const VALID_CATEGORIES: readonly string[] = [
  "bug",
  "security",
  "architecture",
  "maintainability",
  "performance",
  "style",
];

const MAX_DIFF_CHARS = 200_000; // ~50k tokens at 4 chars/token

interface RawModelFinding {
  readonly severity?: string;
  readonly category?: string;
  readonly path?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly description?: string;
  readonly suggestion?: string;
}

const isValidSeverity = (s: string): s is Severity =>
  (SEVERITIES as readonly string[]).includes(s);

const isValidCategory = (s: string): s is Category =>
  VALID_CATEGORIES.includes(s);

const normalizeFinding = (
  raw: RawModelFinding,
  sessionId: string,
  persona?: string,
): ReviewFinding | null => {
  const severity = raw.severity?.toLowerCase() ?? "";
  const category = raw.category?.toLowerCase() ?? "";

  if (!isValidSeverity(severity)) return null;
  if (!isValidCategory(category)) return null;
  if (typeof raw.path !== "string" || raw.path.length === 0) return null;
  if (typeof raw.description !== "string" || raw.description.length === 0)
    return null;
  if (typeof raw.suggestion !== "string" || raw.suggestion.length === 0)
    return null;

  const startLine =
    typeof raw.startLine === "number" &&
    Number.isInteger(raw.startLine) &&
    raw.startLine > 0
      ? raw.startLine
      : undefined;

  const endLine =
    typeof raw.endLine === "number" &&
    Number.isInteger(raw.endLine) &&
    raw.endLine > 0
      ? raw.endLine
      : undefined;

  // Drop endLine if it precedes startLine
  const validEndLine =
    startLine !== undefined && endLine !== undefined && endLine < startLine
      ? undefined
      : endLine;

  return {
    id: randomUUID(),
    sessionId,
    severity,
    category,
    path: raw.path,
    startLine,
    endLine: validEndLine,
    description: raw.description,
    suggestion: raw.suggestion,
    persona,
  };
};

export const parseFindings = (
  content: string,
  sessionId: string,
  persona?: string,
): readonly ReviewFinding[] => {
  const trimmed = content.trim();

  // Extract JSON from markdown code fences (handles preamble/postamble text)
  const fenceMatch = /```(?:\w*)\s*\n([\s\S]*?)\n?```/.exec(trimmed);
  const jsonStr = fenceMatch ? fenceMatch[1] : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `model response is not valid JSON: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("model response is not a JSON array");
  }

  return parsed
    .map((raw: RawModelFinding) => normalizeFinding(raw, sessionId, persona))
    .filter((f): f is ReviewFinding => f !== null);
};

const formatFileList = (files: readonly ChangedFile[]): string =>
  files.map((f) => `- ${f.path} (${f.status})`).join("\n");

const validateDiffSize = (diff: string): void => {
  if (diff.length > MAX_DIFF_CHARS) {
    throw new Error(
      `diff is too large (${Math.round(diff.length / 4000)}k estimated tokens). ` +
        "Use --ref to narrow the scope, or review smaller changesets.",
    );
  }
};

export interface ReviewDiffResult {
  readonly findings: readonly ReviewFinding[];
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: { inputTokens: number; outputTokens: number };
}

export const reviewDiff = async (
  client: ModelClient,
  diff: string,
  files: readonly ChangedFile[],
  context: ReviewContext,
  sessionId: string,
  model: string,
): Promise<ReviewDiffResult> => {
  validateDiffSize(diff);

  const systemPrompt = buildSinglePassPrompt(context);
  const userMessage = buildUserMessage(diff, formatFileList(files));

  const response = await client.complete({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  let findings: readonly ReviewFinding[];
  try {
    findings = parseFindings(response.content, sessionId);
  } catch {
    console.error("Warning: could not parse model response as findings JSON.");
    console.error(
      "Raw response (first 500 chars):",
      response.content.slice(0, 500),
    );
    findings = [];
  }

  return {
    findings,
    model,
    durationMs: response.durationMs,
    tokenUsage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    },
  };
};

export const reviewWithPersonas = async (
  client: ModelClient,
  diff: string,
  files: readonly ChangedFile[],
  context: ReviewContext,
  sessionId: string,
  model: string,
  personas: readonly PersonaDefinition[],
  themes: readonly string[] = [],
): Promise<readonly PersonaResult[]> => {
  validateDiffSize(diff);

  const userMessage = buildUserMessage(diff, formatFileList(files));

  const results = await Promise.all(
    personas.map(async (persona): Promise<PersonaResult> => {
      const personaModel = persona.model ?? model;
      const systemPrompt = buildPersonaSystemPrompt(persona, context, themes);

      const response = await client.complete({
        model: personaModel,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      let findings: readonly ReviewFinding[];
      try {
        findings = parseFindings(response.content, sessionId, persona.slug);
      } catch {
        console.error(
          `Warning: could not parse ${persona.name} response as findings JSON.`,
        );
        console.error(
          "Raw response (first 500 chars):",
          response.content.slice(0, 500),
        );
        findings = [];
      }

      return {
        persona: persona.slug,
        findings,
        tokenUsage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
        durationMs: response.durationMs,
      };
    }),
  );

  return results;
};
