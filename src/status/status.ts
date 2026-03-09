import { readdirSync, statSync as fsStatSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { load } from "../config/config.js";
import { extractActiveMilestone } from "../milestones/parse.js";

export interface Status {
  readonly projectName: string;
  readonly projectStatus: string;
  readonly adrCount: number;
  readonly tddCount: number;
  readonly activeMilestone: string;
  readonly contextGeneratedAt: Date | null;
}

const countFiles = (dir: string, pattern: RegExp): number => {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  return entries.filter(
    (entry) => !entry.isDirectory() && pattern.test(entry.name),
  ).length;
};

const contextTimestamp = (path: string): Date | null => {
  try {
    const info = fsStatSync(path);
    return info.mtime;
  } catch {
    return null;
  }
};

export const getStatus = (rootDir: string): Status => {
  const cfg = load(rootDir);

  const adrCount = countFiles(join(rootDir, "docs", "adr"), /^ADR-.*\.md$/);

  const tddCount = countFiles(join(rootDir, "docs", "tdd"), /^TDD-.*\.md$/);

  const activeMilestone = extractActiveMilestone(
    join(rootDir, "docs", "MILESTONES.md"),
  );

  const contextGeneratedAt = contextTimestamp(join(rootDir, "CLAUDE.md"));

  return {
    projectName: cfg.project.name,
    projectStatus: cfg.project.status,
    adrCount,
    tddCount,
    activeMilestone,
    contextGeneratedAt,
  };
};
