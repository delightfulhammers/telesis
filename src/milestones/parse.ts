import { readFileSync, existsSync } from "node:fs";

const MILESTONE_HEADING_RE = /^##\s+\S/;
const STATUS_IN_PROGRESS_RE = /^\*\*Status:\*\*\s+In Progress/i;
const STATUS_COMPLETE_RE = /^\*\*Status:\*\*\s+Complete/i;

interface MilestoneSection {
  lines: string[];
}

/**
 * Extracts the active milestone from a MILESTONES.md file.
 * Prefers the section with "Status: In Progress", falls back to the
 * last "Status: Complete" section.
 */
export const extractActiveMilestone = (path: string): string => {
  if (!existsSync(path)) return "";

  const content = readFileSync(path, "utf-8");
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
