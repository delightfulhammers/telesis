import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create, nextNumber } from "./tdd.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-tdd-test-"));

const setupTDDDir = (): string => {
  const dir = makeTempDir();
  mkdirSync(join(dir, "docs", "tdd"), { recursive: true });
  return dir;
};

describe("tdd", () => {
  it("creates first TDD", () => {
    const rootDir = setupTDDDir();
    const path = create(rootDir, "config-loader");

    expect(path).toBe(
      join(rootDir, "docs", "tdd", "TDD-001-config-loader.md"),
    );
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# TDD-001: config-loader");
    expect(content).toContain("## Overview");
    expect(content).toContain("## Components");
    expect(content).toContain("## Interfaces");
    expect(content).toContain("## Data Model");
    expect(content).toContain("## Open Questions");
  });

  it("creates sequential TDDs", () => {
    const rootDir = setupTDDDir();

    const path1 = create(rootDir, "first");
    expect(path1).toContain("TDD-001-first.md");

    const path2 = create(rootDir, "second");
    expect(path2).toContain("TDD-002-second.md");
  });

  it("creates TDD with existing gap", () => {
    const rootDir = setupTDDDir();
    const tddDir = join(rootDir, "docs", "tdd");

    writeFileSync(
      join(tddDir, "TDD-010-existing.md"),
      "# TDD-010: existing\n",
    );

    const path = create(rootDir, "next");
    expect(path).toContain("TDD-011-next.md");
  });

  it("rejects empty slug", () => {
    const rootDir = setupTDDDir();
    expect(() => create(rootDir, "")).toThrow("slug");
  });

  it("rejects invalid slugs", () => {
    const invalidSlugs = [
      { name: "spaces", slug: "has spaces" },
      { name: "uppercase", slug: "HasUpperCase" },
      { name: "special chars", slug: "has/slashes" },
    ];

    for (const { slug } of invalidSlugs) {
      const rootDir = setupTDDDir();
      expect(() => create(rootDir, slug)).toThrow("slug");
    }
  });

  describe("nextNumber", () => {
    it("returns 1 for empty directory", () => {
      const rootDir = setupTDDDir();
      const num = nextNumber(join(rootDir, "docs", "tdd"));
      expect(num).toBe(1);
    });

    it("returns next with existing files", () => {
      const rootDir = setupTDDDir();
      const tddDir = join(rootDir, "docs", "tdd");

      for (let i = 1; i <= 3; i++) {
        writeFileSync(
          join(tddDir, `TDD-${String(i).padStart(3, "0")}-test.md`),
          `# TDD-${String(i).padStart(3, "0")}: test\n`,
        );
      }

      const num = nextNumber(tddDir);
      expect(num).toBe(4);
    });

    it("ignores non-TDD files", () => {
      const rootDir = setupTDDDir();
      const tddDir = join(rootDir, "docs", "tdd");

      writeFileSync(join(tddDir, "README.md"), "# TDDs\n");

      const num = nextNumber(tddDir);
      expect(num).toBe(1);
    });
  });
});
