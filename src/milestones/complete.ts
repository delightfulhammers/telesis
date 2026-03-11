import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../context/context.js";
import { parseActiveMilestone } from "./parse.js";
import type { MilestoneInfo } from "./parse.js";

export interface CompletionStep {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface CompletionResult {
  readonly milestone: string;
  readonly version: string;
  readonly steps: readonly CompletionStep[];
}

const TDD_FILENAME_RE = /^TDD-0*(\d+)\b/;
const TDD_STATUS_RE = /\*\*Status:\*\*\s+\S+/;

const updateMilestonesStatus = (rootDir: string): CompletionStep => {
  const path = join(rootDir, "docs", "MILESTONES.md");
  try {
    const content = readFileSync(path, "utf-8");
    const updated = content.replace(
      /\*\*Status:\*\*\s+In Progress/i,
      "**Status:** Complete",
    );
    if (updated === content) {
      return {
        name: "Update MILESTONES.md",
        passed: false,
        message: 'No "In Progress" status found to update',
      };
    }
    writeFileSync(path, updated, "utf-8");
    return {
      name: "Update MILESTONES.md",
      passed: true,
      message: "Status set to Complete",
    };
  } catch (err) {
    return {
      name: "Update MILESTONES.md",
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

const bumpPackageVersion = (
  rootDir: string,
  version: string,
): CompletionStep => {
  const path = join(rootDir, "package.json");
  try {
    const content = readFileSync(path, "utf-8");
    const pkg = JSON.parse(content) as { version?: string };
    if (pkg.version === version) {
      return {
        name: "Bump package.json",
        passed: true,
        message: `Already at ${version}`,
      };
    }
    const updated = content.replace(
      /"version":\s*"[^"]*"/,
      `"version": "${version}"`,
    );
    writeFileSync(path, updated, "utf-8");
    return {
      name: "Bump package.json",
      passed: true,
      message: `Version set to ${version}`,
    };
  } catch (err) {
    return {
      name: "Bump package.json",
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

const buildTddIndex = (tddDir: string): ReadonlyMap<number, string> => {
  try {
    const entries = readdirSync(tddDir);
    const index = new Map<number, string>();
    for (const name of entries) {
      const match = TDD_FILENAME_RE.exec(name);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) index.set(num, name);
      }
    }
    return index;
  } catch {
    return new Map();
  }
};

const updateTddStatuses = (
  rootDir: string,
  tddNumbers: readonly number[],
): CompletionStep => {
  if (tddNumbers.length === 0) {
    return {
      name: "Update TDD status",
      passed: true,
      message: "No TDD references to update",
    };
  }

  const tddDir = join(rootDir, "docs", "tdd");
  const index = buildTddIndex(tddDir);
  const updated: string[] = [];
  const errors: string[] = [];

  for (const num of tddNumbers) {
    const filename = index.get(num);
    if (!filename) {
      errors.push(`TDD-${String(num).padStart(3, "0")} not found`);
      continue;
    }

    const path = join(tddDir, filename);
    try {
      const content = readFileSync(path, "utf-8");
      if (/\*\*Status:\*\*\s+Accepted/i.test(content)) {
        updated.push(`TDD-${String(num).padStart(3, "0")} (already Accepted)`);
        continue;
      }
      const newContent = content.replace(TDD_STATUS_RE, "**Status:** Accepted");
      writeFileSync(path, newContent, "utf-8");
      updated.push(`TDD-${String(num).padStart(3, "0")}`);
    } catch (err) {
      errors.push(
        `TDD-${String(num).padStart(3, "0")}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      name: "Update TDD status",
      passed: false,
      message: `Errors: ${errors.join("; ")}`,
    };
  }

  return {
    name: "Update TDD status",
    passed: true,
    message: `Set to Accepted: ${updated.join(", ")}`,
  };
};

const regenerateClaudeMd = (rootDir: string): CompletionStep => {
  try {
    const content = generate(rootDir);
    writeFileSync(join(rootDir, "CLAUDE.md"), content, "utf-8");
    return {
      name: "Regenerate CLAUDE.md",
      passed: true,
      message: "CLAUDE.md regenerated",
    };
  } catch (err) {
    return {
      name: "Regenerate CLAUDE.md",
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

export const completeMilestone = (rootDir: string): CompletionResult => {
  const info = parseActiveMilestone(rootDir);
  if (!info) {
    throw new Error("No active milestone found in docs/MILESTONES.md");
  }

  return completeMilestoneFromInfo(info, rootDir);
};

export const completeMilestoneFromInfo = (
  info: MilestoneInfo,
  rootDir: string,
): CompletionResult => {
  if (info.status !== "In Progress") {
    throw new Error(
      `Milestone "${info.name}" has status "${info.status}" — expected "In Progress"`,
    );
  }

  const steps: CompletionStep[] = [
    updateMilestonesStatus(rootDir),
    bumpPackageVersion(rootDir, info.version),
    updateTddStatuses(rootDir, info.tddReferences),
    regenerateClaudeMd(rootDir),
  ];

  return { milestone: info.name, version: info.version, steps };
};
