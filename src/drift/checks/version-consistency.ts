import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

const VERSION_RE = /^##\s+(?:v)?(\d+\.\d+\.\d+)/;
const STATUS_RE = /^\*\*Status:\*\*\s+(\S+)/;
const FENCE_RE = /^(```|~~~)/;

/**
 * Finds the most recently completed milestone version in MILESTONES.md.
 * Milestones are listed top-to-bottom; the last "Complete" one wins.
 */
export const findLatestCompleteVersion = (
  content: string,
): string | undefined => {
  const lines = content.split("\n");
  let inFence = false;
  let currentVersion: string | undefined;
  let latestComplete: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (FENCE_RE.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const versionMatch = VERSION_RE.exec(trimmed);
    if (versionMatch?.[1]) {
      currentVersion = versionMatch[1];
      continue;
    }

    const statusMatch = STATUS_RE.exec(trimmed);
    if (statusMatch?.[1] && currentVersion) {
      if (statusMatch[1] === "Complete") {
        latestComplete = currentVersion;
      }
    }
  }

  return latestComplete;
};

export const versionConsistencyCheck: DriftCheck = {
  name: "version-consistency",
  description: "package.json version matches latest complete milestone",
  requiresModel: false,
  run: (rootDir): DriftFinding => {
    const pkgPath = join(rootDir, "package.json");
    const milestonesPath = join(rootDir, "docs", "MILESTONES.md");

    if (!existsSync(pkgPath) || !existsSync(milestonesPath)) {
      return {
        check: "version-consistency",
        passed: true,
        message: "package.json or MILESTONES.md not found (skipped)",
        severity: "warning",
        details: [],
      };
    }

    let pkgVersion: string;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
        string,
        unknown
      >;
      pkgVersion = String(pkg.version ?? "");
      if (!pkgVersion) {
        return {
          check: "version-consistency",
          passed: true,
          message: "package.json has no version field (skipped)",
          severity: "warning",
          details: [],
        };
      }
    } catch {
      return {
        check: "version-consistency",
        passed: false,
        message: "Failed to parse package.json",
        severity: "warning",
        details: [],
      };
    }

    const milestonesContent = readFileSync(milestonesPath, "utf-8");
    const latestComplete = findLatestCompleteVersion(milestonesContent);

    if (!latestComplete) {
      return {
        check: "version-consistency",
        passed: true,
        message: "No completed milestones found (skipped)",
        severity: "warning",
        details: [],
      };
    }

    const passed = pkgVersion === latestComplete;
    return {
      check: "version-consistency",
      passed,
      message: passed
        ? `package.json version (${pkgVersion}) matches latest complete milestone`
        : `package.json version (${pkgVersion}) does not match latest complete milestone (${latestComplete})`,
      severity: "warning",
      details: passed
        ? []
        : [
            `package.json: ${pkgVersion}`,
            `Latest complete milestone: ${latestComplete}`,
          ],
    };
  },
};
