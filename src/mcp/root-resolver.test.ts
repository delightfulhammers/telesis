import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot, createRootResolver } from "./root-resolver.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("root-resolver-test");

/** Resolve symlinks so macOS /var → /private/var doesn't cause mismatches. */
const realDir = (): string => realpathSync(makeTempDir());

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  writeFileSync(
    join(rootDir, ".telesis", "config.yml"),
    "project:\n  name: Test\n",
  );
};

describe("findProjectRoot", () => {
  it("finds root when starting in the project directory", () => {
    const dir = realDir();
    setupProject(dir);
    expect(findProjectRoot(dir)).toBe(dir);
  });

  it("finds root from a subdirectory", () => {
    const dir = realDir();
    setupProject(dir);
    const subDir = join(dir, "src", "cli");
    mkdirSync(subDir, { recursive: true });
    expect(findProjectRoot(subDir)).toBe(dir);
  });

  it("throws when no config is found", () => {
    const dir = realDir();
    expect(() => findProjectRoot(dir)).toThrow("no .telesis/config.yml found");
  });
});

describe("createRootResolver", () => {
  it("uses override when provided", () => {
    const dir = realDir();
    setupProject(dir);
    const resolver = createRootResolver("/some/default");
    expect(resolver(dir)).toBe(dir);
  });

  it("falls back to default cwd when no override", () => {
    const dir = realDir();
    setupProject(dir);
    const resolver = createRootResolver(dir);
    expect(resolver()).toBe(dir);
  });

  it("throws from default cwd when no config", () => {
    const dir = realDir();
    const resolver = createRootResolver(dir);
    expect(() => resolver()).toThrow("no .telesis/config.yml found");
  });
});
