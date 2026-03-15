import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ORCHESTRATOR_STATES, type OrchestratorContext } from "./types.js";

const STATE_PATH = ".telesis/orchestrator.json";

/** Atomically persists orchestrator context to disk. */
export const saveContext = (
  rootDir: string,
  ctx: OrchestratorContext,
): void => {
  const filePath = join(rootDir, STATE_PATH);
  const tmpPath = `${filePath}.tmp`;

  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(ctx, null, 2) + "\n");
  renameSync(tmpPath, filePath);
};

/** Loads persisted orchestrator context, or null if none exists. */
export const loadContext = (rootDir: string): OrchestratorContext | null => {
  const filePath = join(rootDir, STATE_PATH);

  try {
    const data = readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(data);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).state !== "string" ||
      !Array.isArray((parsed as Record<string, unknown>).workItemIds) ||
      typeof (parsed as Record<string, unknown>).updatedAt !== "string"
    ) {
      throw new Error(
        "Corrupted orchestrator state at .telesis/orchestrator.json — delete it to reset",
      );
    }

    const state = (parsed as Record<string, unknown>).state as string;
    if (!(ORCHESTRATOR_STATES as readonly string[]).includes(state)) {
      throw new Error(
        `Unknown orchestrator state "${state}" in .telesis/orchestrator.json — delete it to reset`,
      );
    }

    return parsed as OrchestratorContext;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};
