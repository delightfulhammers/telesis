import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { create, nextNumber } from "./adr.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("adr-test");

const setupADRDir = (): string => {
  const dir = makeTempDir();
  mkdirSync(join(dir, "docs", "adr"), { recursive: true });
  return dir;
};

describe("adr", () => {
  it("creates first ADR", () => {
    const rootDir = setupADRDir();
    const path = create(rootDir, "use-cobra");

    expect(path).toBe(join(rootDir, "docs", "adr", "ADR-001-use-cobra.md"));
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# ADR-001: use-cobra");
    expect(content).toContain("## Status");
    expect(content).toContain("Proposed");
    expect(content).toContain("## Context");
    expect(content).toContain("## Decision");
    expect(content).toContain("## Consequences");
  });

  it("creates sequential ADRs", () => {
    const rootDir = setupADRDir();

    const path1 = create(rootDir, "first");
    expect(path1).toContain("ADR-001-first.md");

    const path2 = create(rootDir, "second");
    expect(path2).toContain("ADR-002-second.md");

    const path3 = create(rootDir, "third");
    expect(path3).toContain("ADR-003-third.md");
  });

  it("creates ADR with existing gap", () => {
    const rootDir = setupADRDir();
    const adrDir = join(rootDir, "docs", "adr");

    writeFileSync(join(adrDir, "ADR-005-existing.md"), "# ADR-005: existing\n");

    const path = create(rootDir, "next");
    expect(path).toContain("ADR-006-next.md");
  });

  it("rejects empty slug", () => {
    const rootDir = setupADRDir();
    expect(() => create(rootDir, "")).toThrow("slug");
  });

  it("rejects invalid slugs", () => {
    const invalidSlugs = [
      { name: "spaces", slug: "has spaces" },
      { name: "uppercase", slug: "HasUpperCase" },
      { name: "special chars", slug: "has/slashes" },
      { name: "dots", slug: "has.dots" },
      { name: "starts with hyphen", slug: "-leading" },
      { name: "ends with hyphen", slug: "trailing-" },
    ];

    for (const { slug } of invalidSlugs) {
      const rootDir = setupADRDir();
      expect(() => create(rootDir, slug)).toThrow("slug");
    }
  });

  it("fails with missing directory", () => {
    const rootDir = makeTempDir();
    expect(() => create(rootDir, "something")).toThrow();
  });

  describe("nextNumber", () => {
    it("returns 1 for empty directory", () => {
      const rootDir = setupADRDir();
      const num = nextNumber(join(rootDir, "docs", "adr"));
      expect(num).toBe(1);
    });

    it("returns next with existing files", () => {
      const rootDir = setupADRDir();
      const adrDir = join(rootDir, "docs", "adr");

      for (let i = 1; i <= 3; i++) {
        writeFileSync(
          join(adrDir, `ADR-${String(i).padStart(3, "0")}-test.md`),
          `# ADR-${String(i).padStart(3, "0")}: test\n`,
        );
      }

      const num = nextNumber(adrDir);
      expect(num).toBe(4);
    });

    it("ignores non-ADR files", () => {
      const rootDir = setupADRDir();
      const adrDir = join(rootDir, "docs", "adr");

      writeFileSync(join(adrDir, "README.md"), "# ADRs\n");

      const num = nextNumber(adrDir);
      expect(num).toBe(1);
    });
  });
});
