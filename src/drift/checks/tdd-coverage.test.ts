import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { discoverPackages, tddCoverageCheck } from "./tdd-coverage.js";

describe("discoverPackages", () => {
  const makeTempDir = useTempDir("tdd-coverage");

  const makePackage = (dir: string, pkg: string): void => {
    const pkgDir = join(dir, "src", pkg);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "index.ts"), "export {};");
  };

  it("discovers top-level packages", () => {
    const dir = makeTempDir();
    makePackage(dir, "drift");
    makePackage(dir, "config");
    const packages = discoverPackages(dir);
    expect(packages).toContain("drift");
    expect(packages).toContain("config");
  });

  it("discovers agent sub-packages", () => {
    const dir = makeTempDir();
    makePackage(dir, "agent/review");
    makePackage(dir, "agent/model");
    const packages = discoverPackages(dir);
    expect(packages).toContain("agent/review");
    expect(packages).toContain("agent/model");
  });

  it("ignores directories without .ts files", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src", "empty"), { recursive: true });
    const packages = discoverPackages(dir);
    expect(packages).not.toContain("empty");
  });

  it("ignores directories with only .test.ts files", () => {
    const dir = makeTempDir();
    const pkgDir = join(dir, "src", "testonly");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "foo.test.ts"), "test");
    const packages = discoverPackages(dir);
    expect(packages).not.toContain("testonly");
  });

  it("returns empty when src/ does not exist", () => {
    const dir = makeTempDir();
    expect(discoverPackages(dir)).toEqual([]);
  });
});

describe("tdd-coverage check", () => {
  const makeTempDir = useTempDir("tdd-coverage-check");

  const setup = (
    packages: readonly string[],
    tddContent?: Record<string, string>,
  ): string => {
    const dir = makeTempDir();
    for (const pkg of packages) {
      const pkgDir = join(dir, "src", pkg);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "index.ts"), "export {};");
    }
    mkdirSync(join(dir, "docs", "tdd"), { recursive: true });
    if (tddContent) {
      for (const [name, content] of Object.entries(tddContent)) {
        writeFileSync(join(dir, "docs", "tdd", name), content);
      }
    }
    return dir;
  };

  it("passes when all packages have TDD coverage", () => {
    const dir = setup(["drift", "eval"], {
      "TDD-002-drift.md": "# Drift\n\nCovers `src/drift` and `src/eval`.\n",
    });
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("warns on uncovered non-exempt packages", () => {
    const dir = setup(["drift", "github"], {
      "TDD-002-drift.md": "# Drift\n\nCovers `src/drift`.\n",
    });
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warning");
    expect(result.details).toContainEqual(
      "src/github/ has no TDD referencing it in docs/tdd/",
    );
  });

  it("exempts known infrastructure packages", () => {
    const dir = setup(["cli", "config", "templates"]);
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("exempts agent/model and agent/telemetry", () => {
    const dir = setup(["agent/model", "agent/telemetry"]);
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("warns on uncovered agent sub-packages", () => {
    const dir = setup(["agent/review", "agent/newpkg"], {
      "TDD-003-review.md": "# Review\n\nCovers `src/agent/review`.\n",
    });
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details).toContainEqual(
      "src/agent/newpkg/ has no TDD referencing it in docs/tdd/",
    );
  });

  it("passes when docs/tdd/ does not exist but all packages are exempt", () => {
    const dir = makeTempDir();
    const pkgDir = join(dir, "src", "cli");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "index.ts"), "export {};");
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("matches hyphenated package names in TDD references", () => {
    const dir = setup(["agent/config-extract"], {
      "TDD-001-init.md":
        "# Init\n\nCovers `src/agent/config-extract` package.\n",
    });
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("matches package references across multiple TDD files", () => {
    const dir = setup(["drift", "github"], {
      "TDD-002-drift.md": "# Drift\n\nCovers `src/drift`.\n",
      "TDD-005-github.md": "# GitHub\n\nCovers `src/github`.\n",
    });
    const result = tddCoverageCheck.run(dir);
    expect(result.passed).toBe(true);
  });
});
