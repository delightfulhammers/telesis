import {
  readFileSync,
  readdirSync,
  statSync as fsStatSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { load } from "../config/config.js";

export interface Status {
  readonly projectName: string;
  readonly projectStatus: string;
  readonly adrCount: number;
  readonly tddCount: number;
  readonly activeMilestone: string;
  readonly contextGeneratedAt: Date | null;
}

const MILESTONE_HEADING_RE = /^##\s+\S/;
const STATUS_IN_PROGRESS_RE = /^\*\*Status:\*\*\s+In Progress/i;
const STATUS_COMPLETE_RE = /^\*\*Status:\*\*\s+Complete/i;

const countFiles = (dir: string, pattern: RegExp): number => {
  if (!existsSync(dir)) return 0;

  const entries = readdirSync(dir, { withFileTypes: true });

  return entries.filter(
    (entry) => !entry.isDirectory() && pattern.test(entry.name),
  ).length;
};

interface MilestoneSection {
  readonly lines: string[];
}

const extractActiveMilestone = (path: string): string => {
  if (!existsSync(path)) return "";

  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");

  const sections: MilestoneSection[] = [];
  let current: MilestoneSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (MILESTONE_HEADING_RE.test(trimmed)) {
      const section: MilestoneSection = { lines: [line] };
      sections.push(section);
      current = section;
      continue;
    }

    if (current !== null) {
      if (trimmed === "---") {
        current = null;
        continue;
      }
      (current.lines as string[]).push(line);
    }
  }

  // Prefer "In Progress", fall back to last "Complete"
  let lastComplete: MilestoneSection | null = null;
  for (const section of sections) {
    for (const line of section.lines) {
      const trimmed = line.trim();
      if (STATUS_IN_PROGRESS_RE.test(trimmed)) {
        return section.lines.join("\n").trim();
      }
      if (STATUS_COMPLETE_RE.test(trimmed)) {
        lastComplete = section;
      }
    }
  }

  if (lastComplete !== null) {
    return lastComplete.lines.join("\n").trim();
  }

  return "";
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

  const adrCount = countFiles(
    join(rootDir, "docs", "adr"),
    /^ADR-.*\.md$/,
  );

  const tddCount = countFiles(
    join(rootDir, "docs", "tdd"),
    /^TDD-.*\.md$/,
  );

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
