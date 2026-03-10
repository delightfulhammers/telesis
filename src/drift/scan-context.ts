import { join } from "node:path";
import { findTypeScriptFiles } from "./scan.js";
import type { ScanContext } from "./types.js";

const filterExcludes = (
  files: readonly string[],
  exclude: readonly string[],
): readonly string[] => {
  const normalized = exclude.map((ex) => ex.replace(/\/+$/, ""));
  return files.filter(
    (f) => !normalized.some((ex) => f === ex || f.startsWith(`${ex}/`)),
  );
};

/**
 * Creates a shared scan context that caches the filesystem walk across checks.
 * The full file list is computed once; exclude filtering happens in-memory.
 */
export const createScanContext = (rootDir: string): ScanContext => {
  let cachedFiles: readonly string[] | null = null;

  const allFiles = (): readonly string[] => {
    if (cachedFiles === null) {
      cachedFiles = findTypeScriptFiles(join(rootDir, "src"));
    }
    return cachedFiles;
  };

  return {
    rootDir,
    srcFiles: (exclude) =>
      exclude && exclude.length > 0
        ? filterExcludes(allFiles(), exclude)
        : allFiles(),
  };
};
