import { join, resolve } from "node:path";
import { findSourceFiles } from "./scan.js";
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
export const createScanContext = (
  rootDir: string,
  extensions?: readonly string[],
): ScanContext => {
  const resolvedRoot = resolve(rootDir);
  let cachedFiles: readonly string[] | null = null;

  const allFiles = (): readonly string[] => {
    if (cachedFiles === null) {
      cachedFiles = findSourceFiles(
        join(resolvedRoot, "src"),
        extensions ?? [".ts"],
      );
    }
    return cachedFiles;
  };

  return {
    rootDir: resolvedRoot,
    srcFiles: (exclude) =>
      exclude && exclude.length > 0
        ? filterExcludes(allFiles(), exclude)
        : allFiles(),
  };
};
