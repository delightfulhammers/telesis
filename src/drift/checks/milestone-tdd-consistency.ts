import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

interface MilestoneInfo {
  readonly name: string;
  readonly status: string;
  readonly tddNumbers: readonly number[];
}

const MILESTONE_HEADING_RE = /^##\s+(.+)/;
const STATUS_RE = /^\*\*Status:\*\*\s+(\S+)/;
const REFERENCE_RE = /^\*\*Reference:\*\*/;
const TDD_NUM_RE = /TDD-(\d+)/g; // used only via matchAll — never exec'd directly
const TDD_STATUS_RE = /^\*\*Status:\*\*\s+(\S+)/m;

const parseMilestones = (content: string): readonly MilestoneInfo[] => {
  const milestones: MilestoneInfo[] = [];
  const lines = content.split("\n");

  let current: {
    name: string;
    status: string;
    tddNumbers: Set<number>;
  } | null = null;

  const finalize = (ms: {
    name: string;
    status: string;
    tddNumbers: Set<number>;
  }): MilestoneInfo => ({
    name: ms.name,
    status: ms.status,
    tddNumbers: [...ms.tddNumbers],
  });

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = MILESTONE_HEADING_RE.exec(trimmed);
    if (headingMatch && headingMatch[1]) {
      if (current) milestones.push(finalize(current));
      current = { name: headingMatch[1], status: "", tddNumbers: new Set() };
      continue;
    }

    if (!current) continue;

    const statusMatch = STATUS_RE.exec(trimmed);
    if (statusMatch && statusMatch[1] && !current.status) {
      current.status = statusMatch[1].trim();
      continue;
    }

    if (REFERENCE_RE.test(trimmed)) {
      for (const match of trimmed.matchAll(TDD_NUM_RE)) {
        if (match[1]) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n)) current.tddNumbers.add(n);
        }
      }
    }
  }

  if (current) milestones.push(finalize(current));
  return milestones;
};

const extractTddStatus = (content: string): string => {
  const match = TDD_STATUS_RE.exec(content);
  return match?.[1]?.trim() ?? "";
};

const TDD_FILENAME_RE = /^TDD-0*(\d+)\b/;

const buildTddIndex = (tddDir: string): ReadonlyMap<number, string> => {
  let entries: string[];
  try {
    entries = readdirSync(tddDir);
  } catch {
    return new Map();
  }

  const index = new Map<number, string>();
  for (const name of entries) {
    const match = TDD_FILENAME_RE.exec(name);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && !index.has(num)) {
        index.set(num, name);
      }
    }
  }
  return index;
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
    const tddIndex = buildTddIndex(tddDir);
    const tddStatusCache = new Map<number, string | Error>();
    const details: string[] = [];

    const getTddStatus = (num: number, file: string): string | Error => {
      const cached = tddStatusCache.get(num);
      if (cached !== undefined) return cached;
      const tddPath = join(tddDir, file);
      try {
        const content = readFileSync(tddPath, "utf-8");
        const status = extractTddStatus(content);
        tddStatusCache.set(num, status);
        return status;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        tddStatusCache.set(num, error);
        return error;
      }
    };

    for (const ms of milestones) {
      if (ms.status !== "Complete") continue;
      if (ms.tddNumbers.length === 0) continue;

      for (const num of ms.tddNumbers) {
        const tddFile = tddIndex.get(num);
        if (!tddFile) {
          details.push(
            `${ms.name}: references TDD-${String(num).padStart(3, "0")} but file not found in docs/tdd/`,
          );
          continue;
        }

        const statusOrError = getTddStatus(num, tddFile);
        if (statusOrError instanceof Error) {
          details.push(
            `${ms.name}: could not read TDD-${String(num).padStart(3, "0")} (${statusOrError.message})`,
          );
          continue;
        }

        if (statusOrError !== "Accepted") {
          details.push(
            `${ms.name}: TDD-${String(num).padStart(3, "0")} status is "${statusOrError || "(empty)"}" (expected "Accepted")`,
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
