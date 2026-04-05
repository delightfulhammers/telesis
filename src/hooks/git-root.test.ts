import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { findGitRoot } from "./git-root.js";

const _makeTempDir = useTempDir("git-root");
// Resolve symlinks (macOS /var → /private/var) to match realpathSync in findGitRoot
const makeTempDir = (): string => realpathSync(_makeTempDir());

describe("findGitRoot", () => {
  it("finds .git in the same directory", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".git"));

    expect(findGitRoot(dir)).toBe(dir);
  });

  it("finds .git in a parent directory", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".git"));
    const nested = join(root, "services", "auth");
    mkdirSync(nested, { recursive: true });

    expect(findGitRoot(nested)).toBe(root);
  });

  it("finds .git several levels up", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".git"));
    const deep = join(root, "a", "b", "c", "d");
    mkdirSync(deep, { recursive: true });

    expect(findGitRoot(deep)).toBe(root);
  });

  it("returns null when no .git exists", () => {
    const dir = makeTempDir();
    expect(findGitRoot(dir)).toBeNull();
  });

  it("returns null for nonexistent directory", () => {
    expect(findGitRoot("/nonexistent/path/that/does/not/exist")).toBeNull();
  });

  it("handles .git as a file (worktree)", () => {
    const root = makeTempDir();
    writeFileSync(join(root, ".git"), "gitdir: /some/other/path");
    const sub = join(root, "sub");
    mkdirSync(sub);

    expect(findGitRoot(sub)).toBe(root);
  });

  it("returns nearest .git when nested git repos exist", () => {
    const outer = makeTempDir();
    mkdirSync(join(outer, ".git"));
    const inner = join(outer, "sub");
    mkdirSync(inner);
    mkdirSync(join(inner, ".git"));

    expect(findGitRoot(inner)).toBe(inner);
  });
});
