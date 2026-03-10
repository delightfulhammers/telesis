import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { noProcessExitCheck } from "./no-process-exit.js";

describe("no-process-exit", () => {
  const makeTempDir = useTempDir("no-process-exit");

  const setupProject = (files: Record<string, string>): string => {
    const dir = makeTempDir();
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(dir, "src", path);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
    return dir;
  };

  it("passes when process.exit is only in src/cli/", () => {
    const dir = setupProject({
      "cli/handle-action.ts": "process.exit(1);",
      "config/config.ts": "const x = 1;",
    });

    const result = noProcessExitCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("fails when process.exit is in business logic", () => {
    const dir = setupProject({
      "config/config.ts": "process.exit(1);",
    });

    const result = noProcessExitCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.details[0]).toContain("config/config.ts");
  });

  it("passes when no files use process.exit", () => {
    const dir = setupProject({
      "lib/util.ts": "export const x = 1;",
    });

    const result = noProcessExitCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("detects process.exit with spaces before parenthesis", () => {
    const dir = setupProject({
      "lib/bad.ts": "process.exit (0);",
    });

    const result = noProcessExitCheck.run(dir);
    expect(result.passed).toBe(false);
  });
});
