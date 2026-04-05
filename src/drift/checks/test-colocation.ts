import { basename, join } from "node:path";
import type { DriftCheck } from "../types.js";
import { findSourceFiles, findTypeScriptFiles } from "../scan.js";

const EXCLUDED_DIRS = ["cli", "templates"];

/** Basenames excluded everywhere: pure types, entrypoints, and utilities */
const EXCLUDED_BASENAMES = new Set([
  "types.ts",
  "index.ts",
  "test-utils.ts",
  "stop-words.ts",
]);

/** Specific path suffixes excluded: interface-only adapter files */
const EXCLUDED_SUFFIXES = ["dispatch/adapter.ts", "intake/source.ts"];

/** Test file conventions per language */
interface TestConvention {
  readonly extensions: readonly string[];
  readonly isTestFile: (file: string) => boolean;
  readonly testFileFor: (file: string) => string;
}

const TYPESCRIPT_CONVENTION: TestConvention = {
  extensions: [".ts", ".tsx"],
  isTestFile: (f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"),
  testFileFor: (f) => f.replace(/\.tsx?$/, ".test.ts"),
};

const GO_CONVENTION: TestConvention = {
  extensions: [".go"],
  isTestFile: (f) => f.endsWith("_test.go"),
  testFileFor: (f) => f.replace(/\.go$/, "_test.go"),
};

const PYTHON_CONVENTION: TestConvention = {
  extensions: [".py"],
  isTestFile: (f) => f.endsWith("_test.py") || basename(f).startsWith("test_"),
  testFileFor: (f) => f.replace(/\.py$/, "_test.py"),
};

const CONVENTIONS: Record<string, TestConvention> = {
  TypeScript: TYPESCRIPT_CONVENTION,
  JavaScript: TYPESCRIPT_CONVENTION,
  Go: GO_CONVENTION,
  Python: PYTHON_CONVENTION,
};

const isExcluded = (file: string): boolean => {
  if (EXCLUDED_SUFFIXES.some((s) => file.endsWith(s))) return true;
  const name = basename(file);
  if (EXCLUDED_BASENAMES.has(name)) return true;
  if (name.endsWith(".test.ts")) return true;
  if (name.endsWith("_test.go")) return true;
  if (name.endsWith("_test.py") || name.startsWith("test_")) return true;
  return false;
};

export const testColocationCheck: DriftCheck = {
  name: "test-colocation",
  description: "Business logic files have colocated test files",
  requiresModel: false,
  // No language filter — runs for all languages, adapts convention per file
  run: (rootDir, ctx) => {
    const srcDir = join(rootDir, "src");

    // Use context if available, otherwise scan for all known extensions
    const files = ctx
      ? ctx.srcFiles(EXCLUDED_DIRS)
      : findSourceFiles(srcDir, [".ts", ".go", ".py"], EXCLUDED_DIRS);
    const fileSet = new Set(files);

    const missing: string[] = [];

    for (const f of files) {
      if (isExcluded(f)) continue;

      // Find the matching convention for this file's extension
      const convention = Object.values(CONVENTIONS).find((c) =>
        c.extensions.some((ext) => f.endsWith(ext)),
      );
      if (!convention) continue;
      if (convention.isTestFile(f)) continue;

      const testFile = convention.testFileFor(f);
      if (!fileSet.has(testFile)) {
        missing.push(f);
      }
    }

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
