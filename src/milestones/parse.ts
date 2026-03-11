import { readFileSync } from "node:fs";
import { join } from "node:path";

const MILESTONE_HEADING_RE = /^##\s+\S/;
const STATUS_IN_PROGRESS_RE = /^\*\*Status:\*\*\s+In Progress/i;
const STATUS_COMPLETE_RE = /^\*\*Status:\*\*\s+Complete/i;

const HEADING_RE = /^##\s+(.+)/;
const VERSION_RE = /v?(\d+\.\d+\.\d+)/;
const STATUS_RE = /^\*\*Status:\*\*\s+(.+)/i;
const REFERENCE_RE = /^\*\*Reference:\*\*/;
const TDD_NUM_RE = /TDD-(\d+)/g;
const CRITERIA_HEADING_RE = /^###\s+Acceptance Criteria/i;
const NUMBERED_ITEM_RE = /^\d+\.\s+(.+)/;
const SUBHEADING_RE = /^###\s+/;

export interface MilestoneInfo {
  readonly name: string;
  readonly version: string;
  readonly status: string;
  readonly tddReferences: readonly number[];
  readonly criteria: readonly string[];
  readonly raw: string;
}

interface MilestoneSection {
  lines: string[];
}

/**
 * Extracts the active milestone from a MILESTONES.md file.
 * Prefers the section with "Status: In Progress", falls back to the
 * last "Status: Complete" section.
 */
export const extractActiveMilestone = (path: string): string => {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
  const lines = content.split("\n");

  const sections: MilestoneSection[] = [];
  let current: MilestoneSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (MILESTONE_HEADING_RE.test(trimmed)) {
      current = { lines: [line] };
      sections.push(current);
      continue;
    }

    if (current !== null) {
      if (trimmed === "---") {
        current = null;
        continue;
      }
      current.lines.push(line);
    }
  }

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

/**
 * Parses structured milestone info from raw section text.
 * Exported for testing; prefer `parseActiveMilestone` in production code.
 */
export const parseMilestoneText = (raw: string): MilestoneInfo | undefined => {
  const lines = raw.split("\n");
  if (lines.length === 0) return undefined;

  const headingMatch = HEADING_RE.exec(lines[0]?.trim() ?? "");
  if (!headingMatch?.[1]) return undefined;

  const name = headingMatch[1];
  const versionMatch = VERSION_RE.exec(name);
  const version = versionMatch?.[1] ?? "";

  let status = "";
  const tddRefs = new Set<number>();
  const criteria: string[] = [];
  let inCriteria = false;

  for (const line of lines.slice(1)) {
    const trimmed = line.trim();

    if (SUBHEADING_RE.test(trimmed)) {
      inCriteria = CRITERIA_HEADING_RE.test(trimmed);
      continue;
    }

    if (!status) {
      const statusMatch = STATUS_RE.exec(trimmed);
      if (statusMatch?.[1]) {
        status = statusMatch[1].trim();
        continue;
      }
    }

    if (REFERENCE_RE.test(trimmed)) {
      for (const m of trimmed.matchAll(TDD_NUM_RE)) {
        if (m[1]) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) tddRefs.add(n);
        }
      }
      continue;
    }

    if (inCriteria) {
      const itemMatch = NUMBERED_ITEM_RE.exec(trimmed);
      if (itemMatch?.[1]) {
        criteria.push(itemMatch[1]);
      }
    }
  }

  return {
    name,
    version,
    status,
    tddReferences: [...tddRefs],
    criteria,
    raw,
  };
};

/**
 * Parses the active milestone from MILESTONES.md into structured info.
 * Returns undefined when no active milestone exists.
 */
export const parseActiveMilestone = (
  rootDir: string,
): MilestoneInfo | undefined => {
  const path = join(rootDir, "docs", "MILESTONES.md");
  const raw = extractActiveMilestone(path);
  if (!raw) return undefined;
  return parseMilestoneText(raw);
};
