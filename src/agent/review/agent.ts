import { randomUUID } from "node:crypto";
import type { ModelClient } from "../model/client.js";
import {
  SEVERITIES,
  type ChangedFile,
  type ReviewContext,
  type ReviewFinding,
  type Category,
  type Severity,
} from "./types.js";
import { buildSystemPrompt, buildUserMessage } from "./prompts.js";
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

  return {
    id: randomUUID(),
    sessionId,
    severity,
    category,
    path: raw.path,
    startLine: typeof raw.startLine === "number" ? raw.startLine : undefined,
    endLine: typeof raw.endLine === "number" ? raw.endLine : undefined,
    description: raw.description,
    suggestion: raw.suggestion,
  };
};

const parseFindings = (
  content: string,
  sessionId: string,
): readonly ReviewFinding[] => {
  const trimmed = content.trim();

  // Strip markdown code fences if present
  const jsonStr = trimmed.startsWith("```")
    ? trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "")
    : trimmed;

  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error("model response is not a JSON array");
  }

  return parsed
    .map((raw: RawModelFinding) => normalizeFinding(raw, sessionId))
    .filter((f): f is ReviewFinding => f !== null);
};

const formatFileList = (files: readonly ChangedFile[]): string =>
  files.map((f) => `- ${f.path} (${f.status})`).join("\n");

export const reviewDiff = async (
  client: ModelClient,
  diff: string,
  files: readonly ChangedFile[],
  context: ReviewContext,
  sessionId: string,
  model: string,
): Promise<{
  readonly findings: readonly ReviewFinding[];
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: { inputTokens: number; outputTokens: number };
}> => {
  if (diff.length > MAX_DIFF_CHARS) {
    throw new Error(
      `diff is too large (${Math.round(diff.length / 4000)}k estimated tokens). ` +
        "Use --ref to narrow the scope, or review smaller changesets.",
    );
  }

  const systemPrompt = buildSystemPrompt(context);
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
