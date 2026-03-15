import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createInterface } from "node:readline";
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

export async function* streamTelemetryRecords(
  filePath: string,
): AsyncGenerator<ModelCallRecord> {
  try {
    await access(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isValidRecord(parsed)) {
        yield parsed;
      }
    } catch {
      // skip malformed lines
    }
  }
}

export const loadTelemetryRecords = async (
  rootDir: string,
): Promise<LoadTelemetryResult> => {
  const filePath = join(resolve(rootDir), TELEMETRY_PATH);
  const records: ModelCallRecord[] = [];
  for await (const r of streamTelemetryRecords(filePath)) {
    records.push(r);
  }
  return { records, invalidLineCount: 0 };
};
