import type { DriftCheck, DriftSeverity, ScanContext } from "./types.js";
import { findSourceFiles, scanForPattern } from "./scan.js";
import type { DriftContainmentRule } from "../config/config.js";

/** Common source file extensions for scanning when no ScanContext is available. */
const ALL_SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".go",
  ".py",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
];

/** Escape special regex characters in a string. */
const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Build a regex that matches import/require statements containing the given pattern.
 *  Handles TypeScript/JavaScript imports, Go imports, Python imports, and require(). */
const buildImportRegex = (importPattern: string): RegExp => {
  const escaped = escapeRegex(importPattern);
  // Match:
  //   import ... from "pattern"
  //   import "pattern"
  //   require("pattern")
  //   "pattern" (Go bare import inside import block)
  return new RegExp(
    `(?:import|require|from)\\s*(?:\\(\\s*)?["']${escaped}|^\\s*["']${escaped}["']`,
  );
};

const TEST_FILE_RE = /[._]test\.|_test\.|[._]spec\./;

/** Build DriftCheck objects from declarative containment rules. */
export const buildContainmentChecks = (
  rules: readonly DriftContainmentRule[],
): readonly DriftCheck[] =>
  rules.map((rule) => {
    const name = `containment:${rule.import}`;
    const description =
      rule.description ??
      `${rule.import} is only allowed in ${rule.allowedIn.join(", ")}`;
    const severity: DriftSeverity = rule.severity ?? "error";
    const excludeTests = rule.excludeTests ?? true;
    const pattern = buildImportRegex(rule.import);

    const isAllowed = (file: string): boolean =>
      rule.allowedIn.some((prefix) => file.startsWith(prefix));

    const check: DriftCheck = {
      name,
      description,
      requiresModel: false,
      run: (rootDir: string, ctx?: ScanContext) => {
        // Scan from project root (not src/) to support any project layout
        const allFiles = ctx
          ? ctx.srcFiles()
          : findSourceFiles(rootDir, ALL_SOURCE_EXTENSIONS);
        const files = excludeTests
          ? allFiles.filter((f) => !TEST_FILE_RE.test(f))
          : allFiles;

        const hits = scanForPattern(rootDir, files, pattern).filter(
          (h) => !isAllowed(h.file),
        );

        return {
          check: name,
          passed: hits.length === 0,
          message:
            hits.length === 0
              ? `${rule.import} only imported in allowed locations`
              : `${rule.import} imported in ${hits.length} disallowed file(s)`,
          severity,
          details: hits.map((h) => `${h.file}:${h.line} ${h.content}`),
        };
      },
    };

    return check;
  });
