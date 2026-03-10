import { randomUUID } from "node:crypto";
import type { ModelClient } from "../model/client.js";
import type {
  DedupResult,
  PersonaResult,
  ReviewFinding,
  Severity,
} from "./types.js";
import { SEVERITIES } from "./types.js";
import { buildDedupPrompt } from "./prompts.js";
import { parseJsonResponse } from "./json-parse.js";

interface DedupGroup {
  readonly keepId: string;
  readonly duplicateIds: readonly string[];
}

const linesOverlap = (a: ReviewFinding, b: ReviewFinding): boolean => {
  // Both lack line numbers — consider them candidates
  if (a.startLine === undefined && b.startLine === undefined) {
    return true;
  }

  // One has lines, the other doesn't — not candidates
  if (a.startLine === undefined || b.startLine === undefined) {
    return false;
  }

  const aEnd = a.endLine ?? a.startLine;
  const bEnd = b.endLine ?? b.startLine;

  return a.startLine <= bEnd && b.startLine <= aEnd;
};

/**
 * Groups findings that target the same file with overlapping line ranges.
 * Only groups with 2+ findings are returned (single findings have no dedup candidates).
 */
export const groupDedupCandidates = (
  findings: readonly ReviewFinding[],
): readonly (readonly ReviewFinding[])[] => {
  const byPath = new Map<string, ReviewFinding[]>();
  for (const f of findings) {
    const existing = byPath.get(f.path);
    if (existing) {
      existing.push(f);
    } else {
      byPath.set(f.path, [f]);
    }
  }

  const groups: ReviewFinding[][] = [];

  for (const fileFndings of byPath.values()) {
    if (fileFndings.length < 2) continue;

    // Build overlap groups via union-find style grouping
    const visited = new Set<string>();

    for (let i = 0; i < fileFndings.length; i++) {
      if (visited.has(fileFndings[i].id)) continue;

      const group = [fileFndings[i]];
      visited.add(fileFndings[i].id);

      for (let j = i + 1; j < fileFndings.length; j++) {
        if (visited.has(fileFndings[j].id)) continue;
        if (linesOverlap(fileFndings[i], fileFndings[j])) {
          group.push(fileFndings[j]);
          visited.add(fileFndings[j].id);
        }
      }

      if (group.length >= 2) {
        groups.push(group);
      }
    }
  }

  return groups;
};

const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);

const higherSeverity = (a: Severity, b: Severity): Severity =>
  severityRank(a) <= severityRank(b) ? a : b;

const parseDedupResponse = (content: string): readonly DedupGroup[] => {
  const parsed = parseJsonResponse(content);

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (g): g is DedupGroup =>
      typeof g === "object" &&
      g !== null &&
      typeof (g as Record<string, unknown>).keepId === "string" &&
      Array.isArray((g as Record<string, unknown>).duplicateIds),
  );
};

/**
 * Deduplicates findings across personas using an LLM call.
 * Returns all findings with duplicates merged (highest severity kept,
 * suggestions combined, dedupGroupId linking merged findings).
 *
 * If the LLM call fails, returns all findings unmerged.
 */
export const deduplicateFindings = async (
  personaResults: readonly PersonaResult[],
  client: ModelClient,
  model: string,
): Promise<DedupResult> => {
  const allFindings = personaResults.flatMap((r) => [...r.findings]);

  if (allFindings.length < 2) {
    return { findings: allFindings, mergedCount: 0 };
  }

  const groups = groupDedupCandidates(allFindings);

  if (groups.length === 0) {
    return { findings: allFindings, mergedCount: 0 };
  }

  // Flatten candidates for the LLM call
  const candidates = groups.flat().map((f) => ({
    id: f.id,
    persona: f.persona ?? "unknown",
    severity: f.severity,
    category: f.category,
    path: f.path,
    description: f.description,
    suggestion: f.suggestion,
  }));

  let dedupGroups: readonly DedupGroup[];
  let tokenUsage: DedupResult["tokenUsage"];

  try {
    const response = await client.complete({
      model,
      system:
        "You are a deduplication engine. Return only valid JSON. No explanation.",
      messages: [{ role: "user", content: buildDedupPrompt(candidates) }],
    });

    dedupGroups = parseDedupResponse(response.content);
    tokenUsage = {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    };
  } catch {
    console.error(
      "Warning: deduplication call failed, returning all findings.",
    );
    return { findings: allFindings, mergedCount: 0 };
  }

  if (dedupGroups.length === 0) {
    return { findings: allFindings, mergedCount: 0, tokenUsage };
  }

  // Build a map of finding ID → finding for quick lookup
  const findingMap = new Map(allFindings.map((f) => [f.id, f]));
  const removedIds = new Set<string>();
  const merged: ReviewFinding[] = [];

  for (const group of dedupGroups) {
    const kept = findingMap.get(group.keepId);
    if (!kept) continue;

    const groupId = randomUUID();
    const duplicates = group.duplicateIds
      .map((id) => findingMap.get(id))
      .filter((f): f is ReviewFinding => f !== undefined);

    if (duplicates.length === 0) continue;

    // Combine suggestions from duplicates
    const allSuggestions = [kept, ...duplicates].map((f) =>
      f.persona ? `[${f.persona}] ${f.suggestion}` : f.suggestion,
    );
    const combinedSuggestion = allSuggestions.join("\n");

    // Keep highest severity
    const bestSeverity = duplicates.reduce(
      (best, f) => higherSeverity(best, f.severity),
      kept.severity,
    );

    merged.push({
      ...kept,
      severity: bestSeverity,
      suggestion: combinedSuggestion,
      dedupGroupId: groupId,
    });

    for (const dup of duplicates) {
      removedIds.add(dup.id);
    }
    removedIds.add(kept.id);
  }

  // Combine: merged findings + unmerged findings
  const unmerged = allFindings.filter((f) => !removedIds.has(f.id));
  const result = [...merged, ...unmerged];

  return {
    findings: result,
    mergedCount: removedIds.size - merged.length,
    tokenUsage,
  };
};
