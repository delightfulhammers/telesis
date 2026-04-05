import { existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Walks upward from `startDir` looking for `.git` (file or directory).
 * Returns the directory containing `.git`, or null if not found.
 *
 * Supports both normal repos (`.git/` directory) and git worktrees
 * (`.git` file). Only checks existence, not type.
 */
export const findGitRoot = (startDir: string): string | null => {
  let dir: string;
  try {
    dir = realpathSync(startDir);
  } catch {
    return null;
  }

  for (;;) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};
