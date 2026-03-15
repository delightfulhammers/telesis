import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import type { Decision, DecisionKind } from "./types.js";

const DECISIONS_DIR = ".telesis/decisions";

const decisionsDir = (rootDir: string): string => join(rootDir, DECISIONS_DIR);

const decisionPath = (rootDir: string, id: string): string =>
  join(decisionsDir(rootDir), `${id}.json`);

export interface CreateDecisionInput {
  readonly kind: DecisionKind;
  readonly summary: string;
  readonly detail: string;
}

/** Creates a new pending decision and persists it. */
export const createDecision = (
  rootDir: string,
  input: CreateDecisionInput,
): Decision => {
  const dir = decisionsDir(rootDir);
  mkdirSync(dir, { recursive: true });

  const decision: Decision = {
    id: randomUUID(),
    kind: input.kind,
    createdAt: new Date().toISOString(),
    summary: input.summary,
    detail: input.detail,
  };

  const filePath = decisionPath(rootDir, decision.id);
  writeFileSync(filePath, JSON.stringify(decision, null, 2) + "\n");

  return decision;
};

/** Loads a decision by ID, or null if not found. */
export const loadDecision = (rootDir: string, id: string): Decision | null => {
  try {
    const data = readFileSync(decisionPath(rootDir, id), "utf-8");
    return JSON.parse(data) as Decision;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};

/** Lists all pending (unresolved) decisions, newest first. */
export const listPendingDecisions = (rootDir: string): readonly Decision[] => {
  const dir = decisionsDir(rootDir);

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const decisions: Decision[] = [];
  for (const entry of entries) {
    let data: string;
    try {
      data = readFileSync(join(dir, entry), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    let decision: Decision;
    try {
      decision = JSON.parse(data) as Decision;
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.error(
          `Warning: could not parse decision file ${entry}, skipping: ${err}`,
        );
        continue;
      }
      throw err;
    }
    if (!decision.id || !decision.kind || !decision.createdAt) {
      console.error(
        `Warning: structurally invalid decision file ${entry}, skipping`,
      );
      continue;
    }
    if (!decision.resolvedAt) {
      decisions.push(decision);
    }
  }

  return decisions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};

/** Resolves a pending decision. Throws if not found or already resolved. */
export const resolveDecision = (
  rootDir: string,
  id: string,
  resolution: "approved" | "rejected",
  reason?: string,
): Decision => {
  const existing = loadDecision(rootDir, id);
  if (!existing) {
    throw new Error(`Decision not found: ${id}`);
  }
  if (existing.resolvedAt) {
    throw new Error(`Decision ${id} is already resolved`);
  }

  const resolved: Decision = {
    ...existing,
    resolvedAt: new Date().toISOString(),
    resolution,
    reason,
  };

  const filePath = decisionPath(rootDir, id);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(resolved, null, 2) + "\n");
  renameSync(tmpPath, filePath);

  return resolved;
};
