import { join } from "node:path";
import type { DriftCheck } from "../types.js";
import { findTypeScriptFiles, scanForPattern } from "../scan.js";

const ALLOWED_PREFIXES = ["src/cli/", "src/index.ts"];
const IMPORT_PATTERN = /(?:import|require)\s*(?:\(|.*from\s*)["']commander["']/;

const isAllowed = (file: string): boolean =>
  ALLOWED_PREFIXES.some(
    (prefix) => `src/${file}` === prefix || `src/${file}`.startsWith(prefix),
  );

const isTestFile = (file: string): boolean => file.endsWith(".test.ts");

export const commanderImportCheck: DriftCheck = {
  name: "commander-import-containment",
  description: "commander imported only in src/cli/ and src/index.ts",
  requiresModel: false,
  run: (rootDir) => {
    const srcDir = join(rootDir, "src");
    const files = findTypeScriptFiles(srcDir).filter((f) => !isTestFile(f));
    const hits = scanForPattern(srcDir, files, IMPORT_PATTERN).filter(
      (h) => !isAllowed(h.file),
    );

    return {
      check: "commander-import-containment",
      passed: hits.length === 0,
      message:
        hits.length === 0
          ? "commander only imported in allowed locations"
          : `commander imported in ${hits.length} disallowed file(s)`,
      severity: "error",
      details: hits.map((h) => `src/${h.file}:${h.line} ${h.content}`),
    };
  },
};
