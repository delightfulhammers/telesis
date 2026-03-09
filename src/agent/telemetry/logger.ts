import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ModelCallRecord } from "./types.js";

export interface TelemetryLogger {
  readonly log: (record: ModelCallRecord) => void;
}

export const createTelemetryLogger = (rootDir: string): TelemetryLogger => {
  const resolvedRoot = resolve(rootDir);
  const telesisDir = join(resolvedRoot, ".telesis");
  const telemetryPath = join(telesisDir, "telemetry.jsonl");

  try {
    mkdirSync(telesisDir, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`telemetry write failed: ${message}`);
  }

  const log = (record: ModelCallRecord): void => {
    try {
      appendFileSync(telemetryPath, JSON.stringify(record) + "\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`telemetry write failed: ${message}`);
    }
  };

  return { log };
};
