import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { testColocationCheck } from "./test-colocation.js";

describe("test-colocation", () => {
  const makeTempDir = useTempDir("test-colocation");

  const setupProject = (files: Record<string, string>): string => {
    const dir = makeTempDir();
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(dir, "src", path);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
    return dir;
  };

  it("passes when all business logic files have tests", () => {
    const dir = setupProject({
      "config/config.ts": "export const x = 1;",
      "config/config.test.ts": "test('x', () => {});",
    });

    const result = testColocationCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("fails when a business logic file lacks a test", () => {
    const dir = setupProject({
      "config/config.ts": "export const x = 1;",
    });

    const result = testColocationCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warning");
    expect(result.details[0]).toContain("config/config.ts");
  });

  it("excludes types.ts files", () => {
    const dir = setupProject({
      "drift/types.ts": "export interface Foo {}",
    });

    const result = testColocationCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("excludes index.ts files", () => {
    const dir = setupProject({
      "drift/index.ts": "export * from './scan.js';",
    });

    const result = testColocationCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("excludes files in src/cli/", () => {
    const dir = setupProject({
      "cli/drift.ts": 'import { Command } from "commander";',
    });

    const result = testColocationCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("excludes files in src/templates/", () => {
    const dir = setupProject({
      "templates/vision.ts": "export default '';",
    });

    const result = testColocationCheck.run(dir);
    expect(result.passed).toBe(true);
  });
});
