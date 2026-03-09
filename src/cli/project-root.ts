import { existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";

export const projectRoot = (): string => {
  let dir = realpathSync(process.cwd());

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
