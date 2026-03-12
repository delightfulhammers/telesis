import { join } from "node:path";
import type { DriftCheck } from "../types.js";
import { findTypeScriptFiles, scanForPattern } from "../scan.js";

const ALLOWED_FILE = "src/daemon/bus.ts";
const IMPORT_PATTERN = /(?:import|require)\s*(?:\(|.*from\s*)["']rxjs/;

const isTestFile = (file: string): boolean => file.endsWith(".test.ts");

export const rxjsImportCheck: DriftCheck = {
  name: "rxjs-import-containment",
  description: "rxjs imported only in src/daemon/bus.ts",
  requiresModel: false,
  run: (rootDir, ctx) => {
    const srcDir = join(rootDir, "src");
    const allFiles = ctx ? ctx.srcFiles() : findTypeScriptFiles(srcDir);
    const files = allFiles.filter((f) => !isTestFile(f));
    const hits = scanForPattern(srcDir, files, IMPORT_PATTERN).filter(
      (h) => `src/${h.file}` !== ALLOWED_FILE,
    );

    return {
      check: "rxjs-import-containment",
      passed: hits.length === 0,
      message:
        hits.length === 0
          ? "rxjs only imported in allowed location"
          : `rxjs imported in ${hits.length} disallowed file(s)`,
      severity: "error",
      details: hits.map((h) => `src/${h.file}:${h.line} ${h.content}`),
    };
  },
};
