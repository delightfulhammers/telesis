import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ModelCallRecord } from "./types.js";

const TELEMETRY_PATH = ".telesis/telemetry.jsonl";

const isFiniteNonNeg = (val: unknown): val is number =>
  typeof val === "number" && Number.isFinite(val) && val >= 0;

const isOptionalFiniteNonNeg = (val: unknown): boolean =>
  val === undefined || isFiniteNonNeg(val);

const isValidRecord = (val: unknown): val is ModelCallRecord => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.timestamp === "string" &&
    typeof obj.component === "string" &&
    typeof obj.model === "string" &&
    typeof obj.provider === "string" &&
    isFiniteNonNeg(obj.inputTokens) &&
    isFiniteNonNeg(obj.outputTokens) &&
    isFiniteNonNeg(obj.durationMs) &&
    typeof obj.sessionId === "string" &&
    isOptionalFiniteNonNeg(obj.cacheReadTokens) &&
    isOptionalFiniteNonNeg(obj.cacheWriteTokens)
  );
};

export interface LoadTelemetryResult {
  readonly records: readonly ModelCallRecord[];
  readonly invalidLineCount: number;
}

export const loadTelemetryRecords = (rootDir: string): LoadTelemetryResult => {
  const resolvedRoot = resolve(rootDir);
  const filePath = join(resolvedRoot, TELEMETRY_PATH);

  let data: string;
  try {
    data = readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return { records: [], invalidLineCount: 0 };
    throw err;
  }

  const records: ModelCallRecord[] = [];
  let invalidLineCount = 0;

  for (const line of data.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isValidRecord(parsed)) {
        records.push(parsed);
      } else {
        invalidLineCount++;
      }
    } catch {
      invalidLineCount++;
    }
  }

  return { records, invalidLineCount };
};
