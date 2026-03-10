import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { commanderImportCheck } from "./commander-import.js";

describe("commander-import-containment", () => {
  const makeTempDir = useTempDir("commander-import");

  const setupProject = (files: Record<string, string>): string => {
    const dir = makeTempDir();
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(dir, "src", path);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
    return dir;
  };

  it("passes when commander is only imported in allowed locations", () => {
    const dir = setupProject({
      "index.ts": 'import { Command } from "commander";',
      "cli/drift.ts": 'import { Command } from "commander";',
      "config/config.ts": "const x = 1;",
    });

    const result = commanderImportCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("fails when commander is imported in business logic", () => {
    const dir = setupProject({
      "config/config.ts": 'import { Command } from "commander";',
    });

    const result = commanderImportCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.details[0]).toContain("config/config.ts");
  });

  it("passes when no files import commander", () => {
    const dir = setupProject({
      "lib/util.ts": "export const add = (a: number, b: number) => a + b;",
    });

    const result = commanderImportCheck.run(dir);
    expect(result.passed).toBe(true);
  });
});
