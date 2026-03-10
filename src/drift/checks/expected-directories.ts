import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck } from "../types.js";

const EXPECTED_DIRS: readonly string[] = [
  "src/adr",
  "src/agent",
  "src/agent/generate",
  "src/agent/init",
  "src/agent/interview",
  "src/agent/model",
  "src/agent/telemetry",
  "src/cli",
  "src/config",
  "src/context",
  "src/docgen",
  "src/drift",
  "src/eval",
  "src/milestones",
  "src/scaffold",
  "src/status",
  "src/tdd",
  "src/templates",
  "docs",
  "docs/adr",
  "docs/tdd",
  "docs/context",
];

export const expectedDirectoriesCheck: DriftCheck = {
  name: "expected-directories",
  description: "All documented directories exist in the repo",
  requiresModel: false,
  run: (rootDir) => {
    const missing = EXPECTED_DIRS.filter(
      (dir) => !existsSync(join(rootDir, dir)),
    );

    return {
      check: "expected-directories",
      passed: missing.length === 0,
      message:
        missing.length === 0
          ? "All expected directories present"
          : `${missing.length} expected directory/directories missing`,
      severity: "warning",
      details: missing.map((dir) => `Missing: ${dir}`),
    };
  },
};
