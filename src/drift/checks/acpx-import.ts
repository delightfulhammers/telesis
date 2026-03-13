import { join } from "node:path";
import type { DriftCheck } from "../types.js";
import { findTypeScriptFiles, scanForPattern } from "../scan.js";

const ALLOWED_FILES: ReadonlySet<string> = new Set([
  "src/dispatch/acpx-adapter.ts",
  "src/drift/checks/acpx-import.ts",
]);
// eslint-disable-next-line no-useless-escape -- drift check pattern
const IMPORT_PATTERN = /["']acpx["']/;

const isTestFile = (file: string): boolean => file.endsWith(".test.ts");

export const acpxImportCheck: DriftCheck = {
  name: "acpx-import-containment",
  description: "acpx imported only in src/dispatch/acpx-adapter.ts",
  requiresModel: false,
  run: (rootDir, ctx) => {
    const srcDir = join(rootDir, "src");
    const allFiles = ctx ? ctx.srcFiles() : findTypeScriptFiles(srcDir);
    const files = allFiles.filter((f) => !isTestFile(f));
    const hits = scanForPattern(srcDir, files, IMPORT_PATTERN).filter(
      (h) => !ALLOWED_FILES.has(`src/${h.file}`),
    );

    return {
      check: "acpx-import-containment",
      passed: hits.length === 0,
      message:
        hits.length === 0
          ? "acpx only imported in allowed location"
          : `acpx imported in ${hits.length} disallowed file(s)`,
      severity: "error",
      details: hits.map((h) => `src/${h.file}:${h.line} ${h.content}`),
    };
  },
};
