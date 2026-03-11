import { execSync } from "node:child_process";
import { allChecks } from "../drift/checks/index.js";
import { runChecks } from "../drift/runner.js";
import { parseActiveMilestone } from "./parse.js";
import type { MilestoneInfo } from "./parse.js";

export interface CheckResult {
  readonly name: string;
  readonly kind: "auto" | "manual";
  readonly passed: boolean;
  readonly message: string;
}

export interface MilestoneCheckReport {
  readonly milestone: string;
  readonly results: readonly CheckResult[];
  readonly passed: boolean;
}

const extractStderr = (err: unknown): string => {
  if (err instanceof Error && "stderr" in err) {
    const stderr = String((err as { stderr: unknown }).stderr).trim();
    if (stderr) return stderr.slice(0, 200);
  }
  return "FAIL";
};

const runShellCheck = (
  name: string,
  command: string,
  rootDir: string,
): CheckResult => {
  try {
    execSync(command, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { name, kind: "auto", passed: true, message: "PASS" };
  } catch (err) {
    return { name, kind: "auto", passed: false, message: extractStderr(err) };
  }
};

const runDriftCheck = (rootDir: string): CheckResult => {
  const report = runChecks(allChecks, rootDir);
  return report.passed
    ? { name: "drift-clean", kind: "auto", passed: true, message: "PASS" }
    : {
        name: "drift-clean",
        kind: "auto",
        passed: false,
        message: `${report.summary.failed} drift error(s)`,
      };
};

const criteriaToManualResults = (
  criteria: readonly string[],
): readonly CheckResult[] =>
  criteria.map((text) => ({
    name: text,
    kind: "manual" as const,
    passed: false,
    message: "requires manual confirmation",
  }));

export const checkMilestone = (rootDir: string): MilestoneCheckReport => {
  const info = parseActiveMilestone(rootDir);
  if (!info) {
    throw new Error("No active milestone found in docs/MILESTONES.md");
  }

  return checkMilestoneFromInfo(info, rootDir);
};

export const checkMilestoneFromInfo = (
  info: MilestoneInfo,
  rootDir: string,
): MilestoneCheckReport => {
  const autoResults: CheckResult[] = [
    runDriftCheck(rootDir),
    runShellCheck("tests-pass", "pnpm test", rootDir),
    runShellCheck("build-succeeds", "pnpm run build", rootDir),
    runShellCheck("lint-passes", "pnpm run lint", rootDir),
  ];

  const manualResults = criteriaToManualResults(info.criteria);
  const results = [...autoResults, ...manualResults];
  const passed = autoResults.every((r) => r.passed);

  return { milestone: info.name, results, passed };
};
