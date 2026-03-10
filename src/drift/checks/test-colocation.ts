import { basename, join } from "node:path";
import type { DriftCheck } from "../types.js";
import { findTypeScriptFiles } from "../scan.js";

const EXCLUDED_DIRS = ["cli", "templates"];

const EXCLUDED_BASENAMES = new Set([
  "types.ts",
  "index.ts",
  "test-utils.ts",
  "stop-words.ts",
]);

const isExcluded = (file: string): boolean => {
  const name = basename(file);
  if (EXCLUDED_BASENAMES.has(name)) return true;
  if (name.endsWith(".test.ts")) return true;
  return false;
};

export const testColocationCheck: DriftCheck = {
  name: "test-colocation",
  description: "Business logic .ts files have colocated .test.ts files",
  requiresModel: false,
  run: (rootDir) => {
    const files = findTypeScriptFiles(join(rootDir, "src"), EXCLUDED_DIRS);
    const fileSet = new Set(files);

    const missing = files
      .filter((f) => !isExcluded(f))
      .filter((f) => !fileSet.has(f.replace(/\.ts$/, ".test.ts")));

    return {
      check: "test-colocation",
      passed: missing.length === 0,
      message:
        missing.length === 0
          ? "All business logic files have colocated tests"
          : `${missing.length} file(s) missing colocated tests`,
      severity: "warning",
      details: missing.map((f) => `Missing test: src/${f}`),
    };
  },
};
