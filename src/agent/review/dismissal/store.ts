import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Dismissal } from "./types.js";
import { DISMISSAL_REASONS } from "./types.js";
import { SEVERITIES } from "../types.js";

const DISMISSALS_PATH = ".telesis/dismissals.jsonl";
const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const VALID_SOURCES = new Set(["cli", "github", "gitlab", "gitea", "bitbucket"]);
const VALID_CATEGORIES = new Set([
  "bug",
  "security",
  "architecture",
  "maintainability",
  "performance",
  "style",
]);

const dismissalsPath = (rootDir: string): string =>
  join(rootDir, DISMISSALS_PATH);

const isDismissalRecord = (obj: unknown): obj is Dismissal => {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.findingId === "string" &&
    typeof r.sessionId === "string" &&
    typeof r.timestamp === "string" &&
    typeof r.path === "string" &&
    typeof r.description === "string" &&
    typeof r.suggestion === "string" &&
    typeof r.reason === "string" &&
    (DISMISSAL_REASONS as readonly string[]).includes(r.reason as string) &&
    typeof r.source === "string" &&
    VALID_SOURCES.has(r.source as string) &&
    typeof r.severity === "string" &&
    (SEVERITIES as readonly string[]).includes(r.severity as string) &&
    typeof r.category === "string" &&
    VALID_CATEGORIES.has(r.category as string)
  );
};

export const appendDismissal = (
  rootDir: string,
  dismissal: Dismissal,
): void => {
  const path = dismissalsPath(rootDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(dismissal) + "\n");
};

export const loadDismissals = (rootDir: string): readonly Dismissal[] => {
  const path = dismissalsPath(rootDir);
  if (!existsSync(path)) return [];

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return [];
  }

  const dismissals: Dismissal[] = [];
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (isDismissalRecord(parsed)) {
        dismissals.push(parsed);
      }
    } catch {
      // skip malformed lines
    }
  }

  return dismissals;
};

export const loadRecentDismissals = (
  rootDir: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): readonly Dismissal[] => {
  const all = loadDismissals(rootDir);
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  return all.filter((d) => d.timestamp >= cutoff);
};

export const findDismissalByFindingId = (
  rootDir: string,
  findingId: string,
): Dismissal | undefined => {
  const all = loadDismissals(rootDir);
  return all.find((d) => d.findingId === findingId);
};
