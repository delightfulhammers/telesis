import type { DriftCheck } from "../types.js";
import { findTypeScriptFiles, scanForPattern } from "../scan.js";

const PROCESS_EXIT_PATTERN = /process\.exit\s*\(/;

const isTestFile = (file: string): boolean => file.endsWith(".test.ts");

export const noProcessExitCheck: DriftCheck = {
  name: "no-process-exit",
  description: "No process.exit calls outside src/cli/",
  requiresModel: false,
  run: (rootDir) => {
    const files = findTypeScriptFiles(`${rootDir}/src`, ["cli"]).filter(
      (f) => !isTestFile(f),
    );
    const hits = scanForPattern(`${rootDir}/src`, files, PROCESS_EXIT_PATTERN);

    return {
      check: "no-process-exit",
      passed: hits.length === 0,
      message:
        hits.length === 0
          ? "No process.exit calls in business logic"
          : `process.exit found in ${hits.length} location(s) outside src/cli/`,
      severity: "error",
      details: hits.map((h) => `src/${h.file}:${h.line} ${h.content}`),
    };
  },
};
