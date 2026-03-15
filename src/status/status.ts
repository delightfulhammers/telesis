import { readdirSync, statSync as fsStatSync, type Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "../config/config.js";
import { extractActiveMilestone } from "../milestones/parse.js";
import { streamTelemetryRecords } from "../agent/telemetry/reader.js";
import {
  loadPricing,
  costForRecord,
  type PricingConfig,
} from "../agent/telemetry/pricing.js";
import type { ModelCallRecord } from "../agent/telemetry/types.js";
import { loadNotes } from "../notes/store.js";

export interface Status {
  readonly projectName: string;
  readonly projectStatus: string;
  readonly adrCount: number;
  readonly tddCount: number;
  readonly activeMilestone: string;
  readonly contextGeneratedAt: Date | null;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly modelCallCount: number;
  readonly noteCount: number;
  readonly estimatedCost: number | null;
}

const countFiles = (dir: string, pattern: RegExp): number => {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  return entries.filter(
    (entry) => !entry.isDirectory() && pattern.test(entry.name),
  ).length;
};

const contextTimestamp = (path: string): Date | null => {
  try {
    const info = fsStatSync(path);
    return info.mtime;
  } catch {
    return null;
  }
};

export const getStatus = async (rootDir: string): Promise<Status> => {
  const cfg = load(rootDir);

  const adrCount = countFiles(join(rootDir, "docs", "adr"), /^ADR-.*\.md$/);

  const tddCount = countFiles(join(rootDir, "docs", "tdd"), /^TDD-.*\.md$/);

  const activeMilestone = extractActiveMilestone(
    join(rootDir, "docs", "MILESTONES.md"),
  );

  const contextGeneratedAt = contextTimestamp(join(rootDir, "CLAUDE.md"));

  const telemetryPath = join(resolve(rootDir), ".telesis", "telemetry.jsonl");
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let modelCallCount = 0;

  const pricing: PricingConfig | null = loadPricing(rootDir);

  const recordCost = (record: ModelCallRecord): number => {
    if (!pricing) return 0;
    const mp = pricing.models[record.provider]?.[record.model];
    return mp ? costForRecord(record, mp) : 0;
  };

  let totalCost = 0;
  for await (const record of streamTelemetryRecords(telemetryPath)) {
    totalInputTokens += record.inputTokens;
    totalOutputTokens += record.outputTokens;
    totalCost += recordCost(record);
    modelCallCount++;
  }

  const noteCount = loadNotes(rootDir).items.length;

  return {
    projectName: cfg.project.name,
    projectStatus: cfg.project.status,
    adrCount,
    tddCount,
    activeMilestone,
    contextGeneratedAt,
    totalInputTokens,
    totalOutputTokens,
    noteCount,
    modelCallCount,
    estimatedCost: modelCallCount > 0 && pricing ? totalCost : null,
  };
};
