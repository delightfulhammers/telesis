import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import {
  EXPECTED_DIRS,
  expectedDirectoriesCheck,
} from "./expected-directories.js";

describe("expected-directories", () => {
  const makeTempDir = useTempDir("expected-dirs");

  it("passes when all expected directories exist", () => {
    const dir = makeTempDir();
    for (const d of EXPECTED_DIRS) {
      mkdirSync(join(dir, d), { recursive: true });
    }

    const result = expectedDirectoriesCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("fails when directories are missing", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src/cli"), { recursive: true });

    const result = expectedDirectoriesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details.some((d) => d.includes("Missing:"))).toBe(true);
  });
});
