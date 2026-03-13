import { randomUUID } from "node:crypto";
import type { OversightFinding } from "./types.js";

const VALID_SEVERITIES = new Set(["info", "warning", "critical"]);

interface RawFinding {
  readonly severity?: string;
  readonly summary?: string;
  readonly detail?: string;
}

export const isValidRawFinding = (val: unknown): val is RawFinding => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.summary === "string" && typeof obj.severity === "string";
};

/** Convert raw model-parsed findings into typed OversightFindings */
export const parseFindings = (
  raw: readonly unknown[],
  observer: string,
  sessionId: string,
  eventCount: number,
): readonly OversightFinding[] =>
  raw.filter(isValidRawFinding).map((r) => ({
    id: randomUUID(),
    observer,
    sessionId,
    severity: VALID_SEVERITIES.has(r.severity ?? "")
      ? (r.severity as OversightFinding["severity"])
      : "info",
    summary: (r.summary ?? "").slice(0, 120),
    detail: typeof r.detail === "string" ? r.detail : "",
    eventRange: { from: 0, to: eventCount },
  }));
