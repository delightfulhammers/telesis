import type { DriftCheck } from "../types.js";
import { findTypeScriptFiles, scanForPattern } from "../scan.js";

const ALLOWED_FILE = "src/agent/model/client.ts";
const IMPORT_PATTERN =
  /(?:import|require)\s*(?:\(|.*from\s*)["']@anthropic-ai\/sdk/;

const isTestFile = (file: string): boolean => file.endsWith(".test.ts");

export const sdkImportCheck: DriftCheck = {
  name: "sdk-import-containment",
  description: "@anthropic-ai/sdk imported only in src/agent/model/client.ts",
  requiresModel: false,
  run: (rootDir) => {
    const files = findTypeScriptFiles(`${rootDir}/src`).filter(
      (f) => !isTestFile(f),
    );
    const hits = scanForPattern(`${rootDir}/src`, files, IMPORT_PATTERN).filter(
      (h) => `src/${h.file}` !== ALLOWED_FILE,
    );

    return {
      check: "sdk-import-containment",
      passed: hits.length === 0,
      message:
        hits.length === 0
          ? "@anthropic-ai/sdk only imported in allowed location"
          : `@anthropic-ai/sdk imported in ${hits.length} disallowed file(s)`,
      severity: "error",
      details: hits.map((h) => `src/${h.file}:${h.line} ${h.content}`),
    };
  },
};
