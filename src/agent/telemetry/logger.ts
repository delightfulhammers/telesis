import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ModelCallRecord } from "./types.js";

export interface TelemetryLogger {
  readonly log: (record: ModelCallRecord) => void;
}

export const createTelemetryLogger = (rootDir: string): TelemetryLogger => {
  const telemetryPath = join(rootDir, ".telesis", "telemetry.jsonl");

  const log = (record: ModelCallRecord): void => {
    try {
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      appendFileSync(telemetryPath, JSON.stringify(record) + "\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`telemetry write failed: ${message}`);
    }
  };

  return { log };
};
