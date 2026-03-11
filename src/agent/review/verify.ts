import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelClient } from "../model/client.js";
import type { TokenUsage } from "../model/types.js";
import type {
  ReviewFinding,
  VerificationEntry,
  VerificationResult,
} from "./types.js";
import { buildVerificationPrompt } from "./prompts.js";
import { parseJsonResponse } from "./json-parse.js";

/**
 * Reads full file contents for all paths referenced by findings.
 * Returns a map of path → file content. Skips unreadable files.
 */
export const gatherFileContents = (
  rootDir: string,
  findings: readonly ReviewFinding[],
): ReadonlyMap<string, string> => {
  const paths = new Set(findings.map((f) => f.path));
  const contents = new Map<string, string>();

  for (const path of paths) {
    try {
      const fullPath = join(rootDir, path);
      contents.set(path, readFileSync(fullPath, "utf-8"));
    } catch {
      // Skip files that can't be read (deleted, moved, etc.)
    }
  }

  return contents;
};

const isVerificationEntry = (v: unknown): v is VerificationEntry =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Record<string, unknown>).index === "number" &&
  typeof (v as Record<string, unknown>).verified === "boolean" &&
  typeof (v as Record<string, unknown>).confidence === "number" &&
  typeof (v as Record<string, unknown>).evidence === "string";

/**
 * Parses the verification LLM response into structured entries.
 */
export const parseVerificationResponse = (
  content: string,
): readonly VerificationEntry[] => {
  const parsed = parseJsonResponse(content);
  if (!Array.isArray(parsed)) return [];
  return (parsed as unknown[]).filter(isVerificationEntry);
};

/**
 * Verifies findings by reading full file contents and asking the model
 * to confirm whether each finding has basis in actual code.
 *
 * This is the Telesis adaptation of Bop's batch verification strategy:
 * send all referenced files + all findings in one LLM call, then filter
 * unverified findings.
 */
export const verifyFindings = async (
  client: ModelClient,
  model: string,
  rootDir: string,
  findings: readonly ReviewFinding[],
): Promise<VerificationResult> => {
  if (findings.length === 0) {
    return { findings: [], filteredCount: 0 };
  }

  const fileContents = gatherFileContents(rootDir, findings);

  // If we couldn't read any files, skip verification and return all findings
  if (fileContents.size === 0) {
    console.error(
      "Warning: could not read any source files for verification, skipping.",
    );
    return { findings, filteredCount: 0 };
  }

  const indexedFindings = findings.map((f, i) => ({
    index: i,
    severity: f.severity,
    category: f.category,
    path: f.path,
    startLine: f.startLine,
    endLine: f.endLine,
    description: f.description,
    suggestion: f.suggestion,
  }));

  const prompt = buildVerificationPrompt(fileContents, indexedFindings);

  try {
    const response = await client.complete({
      model,
      system:
        "You are a code verification engine. Your job is to read full source files and determine whether reported code review findings are real issues or false positives. READ THE FULL FILE CONTENT — do NOT assume findings are correct. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });

    const entries = parseVerificationResponse(response.content);

    // Build a map of index → verification entry for efficient lookup
    const entryMap = new Map(entries.map((e) => [e.index, e]));

    const verified: ReviewFinding[] = [];
    let filteredCount = 0;

    for (let i = 0; i < findings.length; i++) {
      const entry = entryMap.get(i);

      if (!entry) {
        // If the verifier didn't return a result for this finding,
        // keep it (conservative — don't silently drop findings)
        verified.push(findings[i]);
        continue;
      }

      if (entry.verified) {
        // Update confidence with the verifier's independent assessment
        verified.push({
          ...findings[i],
          confidence: Math.round(Math.max(0, Math.min(100, entry.confidence))),
        });
      } else {
        filteredCount++;
      }
    }

    const tokenUsage: TokenUsage = {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    };

    return {
      findings: verified,
      filteredCount,
      tokenUsage,
      durationMs: response.durationMs,
    };
  } catch (err) {
    console.error(
      "Warning: verification failed, proceeding without verification:",
      err instanceof Error ? err.message : err,
    );
    return { findings, filteredCount: 0 };
  }
};
