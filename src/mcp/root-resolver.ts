import { existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * A function that resolves a Telesis project root directory.
 * Accepts an optional override path; falls back to the default cwd.
 */
export type RootResolver = (override?: string) => string;

/**
 * Walks upward from `startDir` looking for `.telesis/config.yml`.
 * Returns the directory that contains it, or throws if none is found.
 */
export const findProjectRoot = (startDir: string): string => {
  let dir: string;
  try {
    dir = realpathSync(startDir);
  } catch {
    throw new Error("no .telesis/config.yml found (run `telesis init` first)");
  }

  for (;;) {
    if (existsSync(join(dir, ".telesis", "config.yml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "no .telesis/config.yml found (run `telesis init` first)",
      );
    }
    dir = parent;
  }
};

/**
 * Creates a RootResolver that uses `defaultCwd` as the fallback starting
 * directory when no explicit override is provided.
 */
export const createRootResolver =
  (defaultCwd: string): RootResolver =>
  (override?: string): string =>
    findProjectRoot(override ?? defaultCwd);
