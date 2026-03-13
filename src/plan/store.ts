import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  PLAN_STATUSES,
  PLAN_TASK_STATUSES,
  type Plan,
  type PlanStatus,
} from "./types.js";

const PLANS_DIR = ".telesis/plans";

const plansDir = (rootDir: string): string => join(resolve(rootDir), PLANS_DIR);

const planPath = (rootDir: string, planId: string): string =>
  join(plansDir(rootDir), `${planId}.json`);

const validStatuses: ReadonlySet<string> = new Set(PLAN_STATUSES);
const validTaskStatuses: ReadonlySet<string> = new Set(PLAN_TASK_STATUSES);

const isValidPlan = (val: unknown): val is Plan => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.workItemId !== "string" ||
    typeof obj.title !== "string" ||
    typeof obj.status !== "string" ||
    !validStatuses.has(obj.status) ||
    typeof obj.createdAt !== "string" ||
    !Array.isArray(obj.tasks)
  )
    return false;

  return obj.tasks.every((t: unknown) => {
    if (!t || typeof t !== "object") return false;
    const task = t as Record<string, unknown>;
    return (
      typeof task.id === "string" &&
      typeof task.title === "string" &&
      typeof task.description === "string" &&
      Array.isArray(task.dependsOn) &&
      typeof task.status === "string" &&
      validTaskStatuses.has(task.status)
    );
  });
};

/** Atomic write: temp file + rename, with best-effort cleanup on failure */
const atomicWritePlan = (dir: string, dest: string, plan: Plan): void => {
  const tmpPath = join(dir, `.${plan.id}.${randomUUID()}.json`);

  writeFileSync(tmpPath, JSON.stringify(plan, null, 2));

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

/** Create a new plan — throws if the plan already exists */
export const createPlan = (rootDir: string, plan: Plan): void => {
  const dir = plansDir(rootDir);
  mkdirSync(dir, { recursive: true });
  const dest = planPath(rootDir, plan.id);

  try {
    writeFileSync(dest, JSON.stringify(plan, null, 2), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Plan ${plan.id.slice(0, 8)} already exists`);
    }
    throw err;
  }
};

/** Atomically update an existing plan */
export const updatePlan = (rootDir: string, plan: Plan): void => {
  const dir = plansDir(rootDir);
  mkdirSync(dir, { recursive: true });
  atomicWritePlan(dir, planPath(rootDir, plan.id), plan);
};

/** Load a plan by exact ID or ID prefix */
export const loadPlan = (rootDir: string, idOrPrefix: string): Plan | null => {
  const id = resolvePlanId(rootDir, idOrPrefix);
  if (!id) return null;

  try {
    const data = readFileSync(planPath(rootDir, id), "utf-8");
    const parsed: unknown = JSON.parse(data);
    if (!isValidPlan(parsed)) {
      process.stderr.write(
        `[telesis] Warning: invalid plan schema for ${id}, returning null\n`,
      );
      return null;
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};

/** Filter options for listing plans */
export interface ListPlansFilter {
  readonly status?: PlanStatus | readonly PlanStatus[];
}

/** List all plans, optionally filtered, sorted by createdAt descending */
export const listPlans = (
  rootDir: string,
  filter?: ListPlansFilter,
): readonly Plan[] => {
  const dir = plansDir(rootDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const jsonFiles = entries.filter(
    (e) => e.endsWith(".json") && !e.startsWith("."),
  );
  const plans: Plan[] = [];

  for (const file of jsonFiles) {
    try {
      const data = readFileSync(join(dir, file), "utf-8");
      const parsed: unknown = JSON.parse(data);
      if (!isValidPlan(parsed)) {
        process.stderr.write(
          `[telesis] Warning: invalid plan schema in ${file}, skipping\n`,
        );
        continue;
      }

      const statusFilter = filter?.status;
      const matchesStatus =
        !statusFilter ||
        (Array.isArray(statusFilter)
          ? statusFilter.includes(parsed.status)
          : parsed.status === statusFilter);
      if (matchesStatus) {
        plans.push(parsed);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (err instanceof SyntaxError) {
        process.stderr.write(
          `[telesis] Warning: corrupt plan file ${file}, skipping\n`,
        );
        continue;
      }
      throw err;
    }
  }

  return plans.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
};

/** Find a plan by work item ID (for dedup) */
export const findByWorkItemId = (
  rootDir: string,
  workItemId: string,
): Plan | null => {
  const all = listPlans(rootDir);
  return all.find((plan) => plan.workItemId === workItemId) ?? null;
};

/** Resolve a plan ID prefix to a full ID */
const resolvePlanId = (rootDir: string, idOrPrefix: string): string | null => {
  if (idOrPrefix.length === 0) return null;
  const dir = plansDir(rootDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  if (entries.includes(`${idOrPrefix}.json`)) return idOrPrefix;

  const matches = entries
    .filter((e) => e.endsWith(".json") && !e.startsWith("."))
    .map((e) => e.slice(0, -5))
    .filter((id) => id.startsWith(idOrPrefix));

  return matches.length === 1 ? matches[0]! : null;
};
