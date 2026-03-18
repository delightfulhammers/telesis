import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { expectedDirectoriesCheck } from "./expected-directories.js";

describe("expected-directories", () => {
  const makeTempDir = useTempDir("expected-dirs");

  it("passes when default directories exist", () => {
    const dir = makeTempDir();
    // Create the default dirs (docs, docs/adr, docs/tdd, docs/context)
    for (const d of ["docs", "docs/adr", "docs/tdd", "docs/context"]) {
      mkdirSync(join(dir, d), { recursive: true });
    }

    const result = expectedDirectoriesCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("fails when directories are missing", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });

    const result = expectedDirectoriesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details.some((d) => d.includes("Missing:"))).toBe(true);
  });

  it("uses custom directories from config", () => {
    const dir = makeTempDir();
    // Create .telesis/config.yml with custom expected directories
    mkdirSync(join(dir, ".telesis"), { recursive: true });
    writeFileSync(
      join(dir, ".telesis", "config.yml"),
      [
        "project:",
        "  name: Test",
        "  languages:",
        "    - Go",
        "drift:",
        "  expectedDirectories:",
        "    - cmd",
        "    - internal",
        "    - docs",
      ].join("\n"),
    );

    // Only create 2 of 3
    mkdirSync(join(dir, "cmd"), { recursive: true });
    mkdirSync(join(dir, "docs"), { recursive: true });

    const result = expectedDirectoriesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details).toContain("Missing: internal");
  });
});
