import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach } from "vitest";

/**
 * Creates a temp directory tracker that automatically cleans up after each test.
 * Call `makeTempDir()` in tests; directories are removed in `afterEach`.
 */
export const useTempDir = (prefix: string) => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    dirs.length = 0;
  });

  return (): string => {
    const dir = mkdtempSync(join(tmpdir(), `telesis-${prefix}-`));
    dirs.push(dir);
    return dir;
  };
};
