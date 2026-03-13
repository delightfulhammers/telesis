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
  WORK_ITEM_STATUSES,
  type WorkItem,
  type WorkItemStatus,
  type IntakeSourceKind,
} from "./types.js";

const INTAKE_DIR = ".telesis/intake";

const intakeDir = (rootDir: string): string =>
  join(resolve(rootDir), INTAKE_DIR);

const itemPath = (rootDir: string, itemId: string): string =>
  join(intakeDir(rootDir), `${itemId}.json`);

const validStatuses: ReadonlySet<string> = new Set(WORK_ITEM_STATUSES);

const isValidWorkItem = (val: unknown): val is WorkItem => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.source === "string" &&
    typeof obj.sourceId === "string" &&
    typeof obj.title === "string" &&
    typeof obj.status === "string" &&
    validStatuses.has(obj.status) &&
    typeof obj.importedAt === "string"
  );
};

/** Atomic write: temp file + rename, with best-effort cleanup on failure */
const atomicWriteItem = (dir: string, dest: string, item: WorkItem): void => {
  const tmpPath = join(dir, `.${item.id}.${randomUUID()}.json`);

  writeFileSync(tmpPath, JSON.stringify(item, null, 2));

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

/** Create a new work item — throws EEXIST if the item already exists */
export const createWorkItem = (rootDir: string, item: WorkItem): void => {
  const dir = intakeDir(rootDir);
  mkdirSync(dir, { recursive: true });
  const dest = itemPath(rootDir, item.id);

  // Atomic exclusive create — wx flag throws EEXIST without a TOCTOU window
  try {
    writeFileSync(dest, JSON.stringify(item, null, 2), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Work item ${item.id.slice(0, 8)} already exists`);
    }
    throw err;
  }
};

/** Atomically update an existing work item */
export const updateWorkItem = (rootDir: string, item: WorkItem): void => {
  const dir = intakeDir(rootDir);
  mkdirSync(dir, { recursive: true });
  atomicWriteItem(dir, itemPath(rootDir, item.id), item);
};

/** Load a work item by exact ID or ID prefix */
export const loadWorkItem = (
  rootDir: string,
  idOrPrefix: string,
): WorkItem | null => {
  const id = resolveItemId(rootDir, idOrPrefix);
  if (!id) return null;

  try {
    const data = readFileSync(itemPath(rootDir, id), "utf-8");
    const parsed: unknown = JSON.parse(data);
    return isValidWorkItem(parsed) ? parsed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};

/** Filter options for listing work items */
export interface ListWorkItemsFilter {
  readonly status?: WorkItemStatus | readonly WorkItemStatus[];
}

/** List all work items, optionally filtered, sorted by importedAt descending */
export const listWorkItems = (
  rootDir: string,
  filter?: ListWorkItemsFilter,
): readonly WorkItem[] => {
  const dir = intakeDir(rootDir);
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
  const items: WorkItem[] = [];

  for (const file of jsonFiles) {
    try {
      const data = readFileSync(join(dir, file), "utf-8");
      const parsed: unknown = JSON.parse(data);
      if (!isValidWorkItem(parsed)) {
        process.stderr.write(
          `[telesis] Warning: invalid work item schema in ${file}, skipping\n`,
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
        items.push(parsed);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (err instanceof SyntaxError) {
        process.stderr.write(
          `[telesis] Warning: corrupt work item file ${file}, skipping\n`,
        );
        continue;
      }
      throw err;
    }
  }

  return items.sort((a, b) => (a.importedAt > b.importedAt ? -1 : 1));
};

/** Find a work item by source kind + source ID (for dedup) */
export const findBySourceId = (
  rootDir: string,
  source: IntakeSourceKind,
  sourceId: string,
): WorkItem | null => {
  const all = listWorkItems(rootDir);
  return (
    all.find((item) => item.source === source && item.sourceId === sourceId) ??
    null
  );
};

/** Resolve an item ID prefix to a full ID */
const resolveItemId = (rootDir: string, idOrPrefix: string): string | null => {
  if (idOrPrefix.length === 0) return null;
  const dir = intakeDir(rootDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  // Exact match first
  if (entries.includes(`${idOrPrefix}.json`)) return idOrPrefix;

  // Prefix match — compare against ID portion only (strip .json suffix)
  const matches = entries
    .filter((e) => e.endsWith(".json") && !e.startsWith("."))
    .map((e) => e.slice(0, -5))
    .filter((id) => id.startsWith(idOrPrefix));

  return matches.length === 1 ? matches[0]! : null;
};
