import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create, validateSlug, nextNumber } from "./docgen.js";
import type { DocConfig } from "./docgen.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-docgen-test-"));

const adrConfig: DocConfig = {
  prefix: "ADR",
  subdir: "adr",
  template: "adr.md.tmpl",
};

const setupDocDir = (subdir: string): string => {
  const dir = makeTempDir();
  mkdirSync(join(dir, "docs", subdir), { recursive: true });
  return dir;
};

describe("docgen", () => {
  describe("create", () => {
    it("creates first document", () => {
      const rootDir = setupDocDir("adr");
      const path = create(rootDir, adrConfig, "use-cobra");

      expect(path).toBe(join(rootDir, "docs", "adr", "ADR-001-use-cobra.md"));
      expect(existsSync(path)).toBe(true);

      const content = readFileSync(path, "utf-8");
      expect(content).toContain("# ADR-001: use-cobra");
    });

    it("creates sequential documents", () => {
      const rootDir = setupDocDir("adr");

      const path1 = create(rootDir, adrConfig, "first");
      expect(path1).toContain("ADR-001-first.md");

      const path2 = create(rootDir, adrConfig, "second");
      expect(path2).toContain("ADR-002-second.md");
    });

    it("handles existing gap", () => {
      const rootDir = setupDocDir("adr");
      const adrDir = join(rootDir, "docs", "adr");

      writeFileSync(
        join(adrDir, "ADR-005-existing.md"),
        "# ADR-005: existing\n",
      );

      const path = create(rootDir, adrConfig, "next");
      expect(path).toContain("ADR-006-next.md");
    });

    it("handles collision", () => {
      const rootDir = setupDocDir("adr");
      const adrDir = join(rootDir, "docs", "adr");

      writeFileSync(
        join(adrDir, "ADR-001-existing.md"),
        "# ADR-001: existing\n",
      );

      const path = create(rootDir, adrConfig, "new-one");
      expect(path).toContain("ADR-002-new-one.md");
    });

    it("fails with missing directory", () => {
      const rootDir = makeTempDir();
      expect(() => create(rootDir, adrConfig, "something")).toThrow();
    });
  });

  describe("validateSlug", () => {
    const validSlugs = [
      { name: "valid simple", slug: "use-cobra" },
      { name: "valid single word", slug: "cobra" },
      { name: "valid with numbers", slug: "v2-migration" },
    ];

    const invalidSlugs = [
      { name: "empty", slug: "" },
      { name: "spaces", slug: "has spaces" },
      { name: "uppercase", slug: "HasUpperCase" },
      { name: "slashes", slug: "has/slashes" },
      { name: "dots", slug: "has.dots" },
      { name: "leading hyphen", slug: "-leading" },
      { name: "trailing hyphen", slug: "trailing-" },
    ];

    for (const { name, slug } of validSlugs) {
      it(`accepts ${name}: "${slug}"`, () => {
        expect(() => validateSlug(slug)).not.toThrow();
      });
    }

    for (const { name, slug } of invalidSlugs) {
      it(`rejects ${name}: "${slug}"`, () => {
        expect(() => validateSlug(slug)).toThrow();
      });
    }
  });

  describe("nextNumber", () => {
    it("returns 1 for empty directory", () => {
      const rootDir = setupDocDir("adr");
      const num = nextNumber(join(rootDir, "docs", "adr"), "ADR");
      expect(num).toBe(1);
    });

    it("returns next number with existing files", () => {
      const rootDir = setupDocDir("adr");
      const adrDir = join(rootDir, "docs", "adr");

      for (let i = 1; i <= 3; i++) {
        writeFileSync(
          join(adrDir, `ADR-${String(i).padStart(3, "0")}-test.md`),
          `# ADR-${String(i).padStart(3, "0")}: test\n`,
        );
      }

      const num = nextNumber(adrDir, "ADR");
      expect(num).toBe(4);
    });

    it("ignores non-matching files", () => {
      const rootDir = setupDocDir("adr");
      const adrDir = join(rootDir, "docs", "adr");

      writeFileSync(join(adrDir, "README.md"), "# ADRs\n");

      const num = nextNumber(adrDir, "ADR");
      expect(num).toBe(1);
    });

    it("ignores subdirectories matching prefix pattern", () => {
      const rootDir = setupDocDir("adr");
      const adrDir = join(rootDir, "docs", "adr");

      writeFileSync(join(adrDir, "ADR-001-first.md"), "# ADR-001: first\n");
      mkdirSync(join(adrDir, "ADR-999-assets"));

      const num = nextNumber(adrDir, "ADR");
      expect(num).toBe(2);
    });
  });
});
