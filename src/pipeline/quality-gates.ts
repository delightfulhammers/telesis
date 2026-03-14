import { execFileSync } from "node:child_process";
import type { QualityGatesConfig } from "../config/config.js";
import type { CommitResult } from "../git/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { createEvent } from "../daemon/types.js";
import type {
  QualityGateName,
  QualityGateResult,
  QualityGateSummary,
} from "./types.js";

/** Dependencies injected into the quality gate runner */
export interface QualityGateDeps {
  readonly rootDir: string;
  readonly workItemId: string;
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly hasChanges: (rootDir: string) => boolean;
  readonly stageAll: (rootDir: string) => void;
  readonly amendCommit: (rootDir: string) => CommitResult;
  readonly runDriftChecks: (rootDir: string) => { passed: boolean };
  readonly execCommand: (command: string, cwd: string) => void;
}

const GATE_ORDER: readonly QualityGateName[] = [
  "format",
  "lint",
  "test",
  "build",
  "drift",
];

/** Build the ordered list of gates to run from config */
const buildGateList = (
  config: QualityGatesConfig,
): readonly { name: QualityGateName; command?: string }[] => {
  const result: { name: QualityGateName; command?: string }[] = [];
  for (const name of GATE_ORDER) {
    if (name === "drift") {
      if (config.drift === true) result.push({ name });
    } else {
      const command = config[name];
      if (typeof command === "string" && command.length > 0) {
        result.push({ name, command });
      }
    }
  }
  return result;
};

/** Run quality gates in order, fail-fast on first failure */
export const runQualityGates = (
  deps: QualityGateDeps,
  config: QualityGatesConfig,
): { summary: QualityGateSummary; amendedCommit?: CommitResult } => {
  const gates = buildGateList(config);

  if (gates.length === 0) {
    return { summary: { ran: false, passed: true, results: [] } };
  }

  const results: QualityGateResult[] = [];
  let amendedCommit: CommitResult | undefined;

  for (const gate of gates) {
    const start = Date.now();

    try {
      if (gate.name === "drift") {
        const report = deps.runDriftChecks(deps.rootDir);
        if (!report.passed) {
          throw new Error("Drift checks failed");
        }
      } else {
        deps.execCommand(gate.command!, deps.rootDir);
      }

      // Format gate: check if files were modified and amend
      let amended = false;
      if (gate.name === "format" && deps.hasChanges(deps.rootDir)) {
        deps.stageAll(deps.rootDir);
        amendedCommit = deps.amendCommit(deps.rootDir);
        amended = true;
      }

      const durationMs = Date.now() - start;
      const result: QualityGateResult = {
        gate: gate.name,
        passed: true,
        durationMs,
        ...(amended ? { amended: true } : {}),
      };
      results.push(result);

      deps.onEvent?.(
        createEvent("pipeline:quality_gate_passed", {
          workItemId: deps.workItemId,
          gate: gate.name,
          durationMs,
          ...(amended ? { amended: true } : {}),
        }),
      );
    } catch (err) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);
      const result: QualityGateResult = {
        gate: gate.name,
        passed: false,
        durationMs,
        error,
      };
      results.push(result);

      deps.onEvent?.(
        createEvent("pipeline:quality_gate_failed", {
          workItemId: deps.workItemId,
          gate: gate.name,
          durationMs,
          error,
        }),
      );

      return {
        summary: { ran: true, passed: false, results },
        amendedCommit,
      };
    }
  }

  return {
    summary: { ran: true, passed: true, results },
    amendedCommit,
  };
};

/** Default execCommand implementation — shells out via sh -c */
export const defaultExecCommand = (command: string, cwd: string): void => {
  try {
    execFileSync("sh", ["-c", command], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (err: unknown) {
    const spawnErr = err as {
      stderr?: Buffer | string;
      stdout?: Buffer | string;
      message?: string;
    };
    const stderr = spawnErr.stderr?.toString().trim();
    const stdout = spawnErr.stdout?.toString().trim();
    const detail = (
      stderr ||
      stdout ||
      spawnErr.message ||
      "unknown error"
    ).slice(0, 2000);
    throw new Error(detail);
  }
};
