import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

interface MilestoneInfo {
  readonly name: string;
  readonly status: string;
  readonly tddNumbers: readonly number[];
}

const MILESTONE_HEADING_RE = /^##\s+(.+)/;
const STATUS_RE = /^\*\*Status:\*\*\s+(.+)/;
const REFERENCE_RE = /^\*\*Reference:\*\*/;
const TDD_NUM_RE = /TDD-(\d+)/g;
const TDD_STATUS_RE = /^\*\*Status:\*\*\s+(.+)/;

const parseMilestones = (content: string): readonly MilestoneInfo[] => {
  const milestones: MilestoneInfo[] = [];
  const lines = content.split("\n");

  let current: { name: string; status: string; tddNumbers: number[] } | null =
    null;

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = MILESTONE_HEADING_RE.exec(trimmed);
    if (headingMatch && headingMatch[1]) {
      if (current) milestones.push(current);
      current = { name: headingMatch[1], status: "", tddNumbers: [] };
      continue;
    }

    if (!current) continue;

    const statusMatch = STATUS_RE.exec(trimmed);
    if (statusMatch && statusMatch[1] && !current.status) {
      current.status = statusMatch[1].trim();
      continue;
    }

    if (REFERENCE_RE.test(trimmed)) {
      let match: RegExpExecArray | null;
      while ((match = TDD_NUM_RE.exec(trimmed)) !== null) {
        if (match[1]) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n)) current.tddNumbers.push(n);
        }
      }
    }
  }

  if (current) milestones.push(current);
  return milestones;
};

const extractTddStatus = (content: string): string => {
  for (const line of content.split("\n")) {
    const match = TDD_STATUS_RE.exec(line.trim());
    if (match && match[1]) return match[1].trim();
  }
  return "";
};

const findTddFile = (
  entries: readonly string[],
  num: number,
): string | undefined => {
  const pattern = new RegExp(`^TDD-0*${num}\\b`);
  return entries.find((name) => pattern.test(name));
};

const readTddEntries = (tddDir: string): readonly string[] => {
  try {
    return readdirSync(tddDir);
  } catch {
    return [];
  }
};

export const milestoneTddConsistencyCheck: DriftCheck = {
  name: "milestone-tdd-consistency",
  description: "Complete milestones have accepted TDDs",
  requiresModel: false,
  run: (rootDir): DriftFinding => {
    const milestonesPath = join(rootDir, "docs", "MILESTONES.md");
    const tddDir = join(rootDir, "docs", "tdd");

    if (!existsSync(milestonesPath)) {
      return {
        check: "milestone-tdd-consistency",
        passed: true,
        message: "No MILESTONES.md found (skipped)",
        severity: "warning",
        details: [],
      };
    }

    let milestonesContent: string;
    try {
      milestonesContent = readFileSync(milestonesPath, "utf-8");
    } catch (err) {
      return {
        check: "milestone-tdd-consistency",
        passed: false,
        message: `Failed to read MILESTONES.md: ${err instanceof Error ? err.message : String(err)}`,
        severity: "warning",
        details: [],
      };
    }

    const milestones = parseMilestones(milestonesContent);
    const tddEntries = readTddEntries(tddDir);
    const details: string[] = [];

    for (const ms of milestones) {
      if (ms.status !== "Complete") continue;
      if (ms.tddNumbers.length === 0) continue;

      for (const num of ms.tddNumbers) {
        const tddFile = findTddFile(tddEntries, num);
        if (!tddFile) {
          details.push(
            `${ms.name}: references TDD-${String(num).padStart(3, "0")} but file not found in docs/tdd/`,
          );
          continue;
        }

        const tddPath = join(tddDir, tddFile);
        let tddContent: string;
        try {
          tddContent = readFileSync(tddPath, "utf-8");
        } catch (err) {
          details.push(
            `${ms.name}: could not read TDD-${String(num).padStart(3, "0")} (${err instanceof Error ? err.message : String(err)})`,
          );
          continue;
        }
        const tddStatus = extractTddStatus(tddContent);

        if (tddStatus !== "Accepted") {
          details.push(
            `${ms.name}: TDD-${String(num).padStart(3, "0")} status is "${tddStatus || "(empty)"}" (expected "Accepted")`,
          );
        }
      }
    }

    const passed = details.length === 0;
    return {
      check: "milestone-tdd-consistency",
      passed,
      message: passed
        ? "All complete milestones have accepted TDDs"
        : `${details.length} milestone/TDD status mismatch(es)`,
      severity: "warning",
      details,
    };
  },
};
