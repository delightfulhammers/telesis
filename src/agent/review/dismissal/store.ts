import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Dismissal } from "./types.js";

const DISMISSALS_PATH = ".telesis/dismissals.jsonl";
const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const dismissalsPath = (rootDir: string): string =>
  join(rootDir, DISMISSALS_PATH);

const isDismissalRecord = (obj: unknown): obj is Dismissal =>
  typeof obj === "object" &&
  obj !== null &&
  typeof (obj as Record<string, unknown>).id === "string" &&
  typeof (obj as Record<string, unknown>).findingId === "string" &&
  typeof (obj as Record<string, unknown>).reason === "string";

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
