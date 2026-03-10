import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { resolveDiff } from "./diff.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("diff-test");

const initGitRepo = (dir: string): void => {
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email test@test.com", {
    cwd: dir,
    stdio: "ignore",
  });
  execSync("git config user.name Test", { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# Test\n");
  execSync("git add -A && git commit -m 'initial'", {
    cwd: dir,
    stdio: "ignore",
  });
};

describe("resolveDiff", () => {
  it("returns empty diff when nothing is staged", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    const result = resolveDiff(dir);
    expect(result.diff).toBe("");
    expect(result.files).toEqual([]);
    expect(result.ref).toBe("staged changes");
  });

  it("resolves staged changes", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    writeFileSync(join(dir, "src.ts"), "const x = 1;\n");
    execSync("git add src.ts", { cwd: dir, stdio: "ignore" });

    const result = resolveDiff(dir);
    expect(result.diff).toContain("src.ts");
    expect(result.diff).toContain("const x = 1");
    expect(result.files).toEqual([{ path: "src.ts", status: "added" }]);
    expect(result.ref).toBe("staged changes");
  });

  it("resolves working + staged changes with --all", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    writeFileSync(join(dir, "README.md"), "# Modified\n");

    const result = resolveDiff(dir, undefined, true);
    expect(result.diff).toContain("Modified");
    expect(result.files).toEqual([{ path: "README.md", status: "modified" }]);
    expect(result.ref).toBe("working + staged changes");
  });

  it("resolves branch diff with --ref", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    execSync("git checkout -b feature", { cwd: dir, stdio: "ignore" });
    writeFileSync(join(dir, "feature.ts"), "export const f = 1;\n");
    execSync("git add -A && git commit -m 'feature'", {
      cwd: dir,
      stdio: "ignore",
    });

    const result = resolveDiff(dir, "main...HEAD");
    expect(result.diff).toContain("feature.ts");
    expect(result.files).toEqual([{ path: "feature.ts", status: "added" }]);
    expect(result.ref).toBe("main...HEAD");
  });

  it("detects deleted files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    unlinkSync(join(dir, "README.md"));
    execSync("git add -A", { cwd: dir, stdio: "ignore" });

    const result = resolveDiff(dir);
    expect(result.files).toEqual([{ path: "README.md", status: "deleted" }]);
  });

  it("detects renamed files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    // Git needs enough content to detect rename (not just empty files)
    writeFileSync(join(dir, "old.ts"), "export const something = 42;\n");
    execSync("git add -A && git commit -m 'add old'", {
      cwd: dir,
      stdio: "ignore",
    });

    execSync("git mv old.ts new.ts", { cwd: dir, stdio: "ignore" });

    const result = resolveDiff(dir);
    expect(result.files.some((f) => f.status === "renamed")).toBe(true);
  });

  it("handles multiple changed files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "const a = 1;\n");
    writeFileSync(join(dir, "src", "b.ts"), "const b = 2;\n");
    execSync("git add -A", { cwd: dir, stdio: "ignore" });

    const result = resolveDiff(dir);
    expect(result.files.length).toBe(2);
  });
});
