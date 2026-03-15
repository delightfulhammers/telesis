import { execSync } from "node:child_process";
import { allChecks } from "../drift/checks/index.js";
import { runChecks } from "../drift/runner.js";
import { loadRawConfig, parsePipelineConfig, load } from "../config/config.js";
import type { QualityGatesConfig } from "../config/config.js";
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

const runDriftCheck = (
  rootDir: string,
  projectLanguages?: readonly string[],
): CheckResult => {
  const report = runChecks(allChecks, rootDir, undefined, projectLanguages);
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
    throw new Error(
      "No milestone is currently In Progress — set a milestone's status to 'In Progress' in docs/MILESTONES.md",
    );
  }

  // Load config after milestone check so missing-config errors don't
  // shadow the more actionable "no milestone" message
  const cfg = load(rootDir);
  const raw = loadRawConfig(rootDir);
  const pipelineConfig = parsePipelineConfig(raw);

  return checkMilestoneFromInfo(
    info,
    rootDir,
    pipelineConfig.qualityGates,
    cfg.project.languages,
  );
};

export const checkMilestoneFromInfo = (
  info: MilestoneInfo,
  rootDir: string,
  qualityGates?: QualityGatesConfig,
  projectLanguages?: readonly string[],
): MilestoneCheckReport => {
  const autoResults: CheckResult[] = [runDriftCheck(rootDir, projectLanguages)];

  if (qualityGates) {
    if (qualityGates.test)
      autoResults.push(runShellCheck("tests-pass", qualityGates.test, rootDir));
    if (qualityGates.build)
      autoResults.push(
        runShellCheck("build-succeeds", qualityGates.build, rootDir),
      );
    if (qualityGates.lint)
      autoResults.push(
        runShellCheck("lint-passes", qualityGates.lint, rootDir),
      );
    if (qualityGates.format)
      autoResults.push(
        runShellCheck("format-passes", qualityGates.format, rootDir),
      );
  } else {
    autoResults.push({
      name: "quality-gates",
      kind: "auto",
      passed: true,
      message: "No quality gates configured — skipping test/build/lint checks",
    });
  }

  const manualResults = criteriaToManualResults(info.criteria);
  const results = [...autoResults, ...manualResults];
  const passed = autoResults.every((r) => r.passed);

  return { milestone: info.name, results, passed };
};
