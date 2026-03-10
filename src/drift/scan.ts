import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Recursively finds all TypeScript files under `dir`, returning paths
 * relative to `dir`. Directories matching any `exclude` pattern are skipped.
 */
export const findTypeScriptFiles = (
  dir: string,
  exclude: readonly string[] = [],
): readonly string[] => {
  const results: string[] = [];

  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const relPath = relative(dir, fullPath);

      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          exclude.some((ex) => relPath === ex || relPath.startsWith(`${ex}/`))
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        results.push(relPath);
      }
    }
  };

  walk(dir);
  return results.sort();
};

/**
 * Scans the given files for lines matching `pattern`, returning an array of
 * `{ file, line, content }` hits. File paths are relative to `rootDir`.
 */
export const scanForPattern = (
  rootDir: string,
  files: readonly string[],
  pattern: RegExp,
): readonly { file: string; line: number; content: string }[] => {
  const hits: { file: string; line: number; content: string }[] = [];

  for (const file of files) {
    const fullPath = join(rootDir, file);
    const content = readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        hits.push({ file, line: i + 1, content: lines[i].trim() });
      }
    }
  }

  return hits;
};
