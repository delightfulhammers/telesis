import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { STAGE_ORDER, type PipelineState, type RunStage } from "./types.js";

const PIPELINES_DIR = ".telesis/pipelines";

const SAFE_ID_RE = /^[\w-]+$/;

const pipelinesDir = (rootDir: string): string =>
  join(resolve(rootDir), PIPELINES_DIR);

const statePath = (rootDir: string, workItemId: string): string => {
  if (!SAFE_ID_RE.test(workItemId)) {
    throw new TypeError(`Invalid workItemId for state path: ${workItemId}`);
  }
  return join(pipelinesDir(rootDir), `${workItemId}.json`);
};

const validStages: ReadonlySet<string> = new Set(STAGE_ORDER);

/** Type guard for loaded pipeline state */
const isValidPipelineState = (val: unknown): val is PipelineState => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.workItemId === "string" &&
    typeof obj.planId === "string" &&
    typeof obj.currentStage === "string" &&
    validStages.has(obj.currentStage) &&
    typeof obj.startedAt === "string" &&
    typeof obj.updatedAt === "string"
  );
};

/** Atomically save pipeline state (temp file + rename) */
export const savePipelineState = (
  rootDir: string,
  state: PipelineState,
): void => {
  const dir = pipelinesDir(rootDir);
  mkdirSync(dir, { recursive: true });

  const dest = statePath(rootDir, state.workItemId);
  const tmpPath = join(dir, `.${state.workItemId}.${randomUUID()}.json`);

  writeFileSync(tmpPath, JSON.stringify(state, null, 2));

  try {
    renameSync(tmpPath, dest);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw err;
  }
};

/** Load pipeline state for a work item — returns null if not found or invalid */
export const loadPipelineState = (
  rootDir: string,
  workItemId: string,
): PipelineState | null => {
  try {
    const data = readFileSync(statePath(rootDir, workItemId), "utf-8");
    const parsed: unknown = JSON.parse(data);
    return isValidPipelineState(parsed) ? parsed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
};

/** Remove pipeline state — no-op if file doesn't exist */
export const removePipelineState = (
  rootDir: string,
  workItemId: string,
): void => {
  try {
    unlinkSync(statePath(rootDir, workItemId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
};
