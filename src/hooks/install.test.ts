import { describe, it, expect } from "vitest";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { useTempDir } from "../test-utils.js";
import { installHook, uninstallHook, isHookInstalled } from "./install.js";

const makeTempDir = useTempDir("hooks-install-test");

/** Create a temp dir with a real git repo */
const makeGitRepo = (): string => {
  const dir = makeTempDir();
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  return dir;
};

describe("installHook", () => {
  it("creates pre-commit hook in .git/hooks/", () => {
    const dir = makeGitRepo();
    installHook(dir);

    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("telesis");
    expect(content).toContain("preflight");
  });

  it("makes the hook executable", () => {
    const dir = makeGitRepo();
    installHook(dir);

    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    const stat = statSync(hookPath);
    // Check user execute bit
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it("appends to existing pre-commit hook without overwriting", () => {
    const dir = makeGitRepo();
    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    writeFileSync(hookPath, "#!/bin/bash\necho 'existing hook'\n");
    chmodSync(hookPath, 0o755);

    installHook(dir);

    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("existing hook");
    expect(content).toContain("telesis");
  });

  it("is idempotent — does not duplicate on second install", () => {
    const dir = makeGitRepo();
    installHook(dir);
    installHook(dir);

    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    // Count start markers only (not end markers)
    const matches = content.match(/^# --- telesis pre-commit hook: /gm);
    expect(matches).toHaveLength(1);
  });

  it("throws if not a git repo", () => {
    const dir = makeTempDir(); // no git init
    expect(() => installHook(dir)).toThrow();
  });
});

describe("uninstallHook", () => {
  it("removes telesis section from pre-commit hook", () => {
    const dir = makeGitRepo();
    installHook(dir);
    uninstallHook(dir);

    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).not.toContain("telesis");
  });

  it("preserves non-telesis content in existing hook", () => {
    const dir = makeGitRepo();
    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    writeFileSync(hookPath, "#!/bin/bash\necho 'existing hook'\n");
    chmodSync(hookPath, 0o755);

    installHook(dir);
    uninstallHook(dir);

    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("existing hook");
    expect(content).not.toContain("telesis");
  });

  it("is a no-op when hook is not installed", () => {
    const dir = makeGitRepo();
    // Should not throw
    uninstallHook(dir);
  });
});

describe("isHookInstalled", () => {
  it("returns false when no hook exists", () => {
    const dir = makeGitRepo();
    expect(isHookInstalled(dir)).toBe(false);
  });

  it("returns true after installation", () => {
    const dir = makeGitRepo();
    installHook(dir);
    expect(isHookInstalled(dir)).toBe(true);
  });

  it("returns false after uninstallation", () => {
    const dir = makeGitRepo();
    installHook(dir);
    uninstallHook(dir);
    expect(isHookInstalled(dir)).toBe(false);
  });

  it("returns false when hook exists but has no telesis section", () => {
    const dir = makeGitRepo();
    const hookPath = join(dir, ".git", "hooks", "pre-commit");
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    writeFileSync(hookPath, "#!/bin/bash\necho 'other hook'\n");
    expect(isHookInstalled(dir)).toBe(false);
  });
});

describe("monorepo support (gitRoot ≠ projectRoot)", () => {
  /** Create a monorepo layout: git root at parent, project in subdirectory */
  const makeMonorepo = (): { gitRoot: string; projectRoot: string } => {
    const gitRoot = makeGitRepo();
    const projectRoot = join(gitRoot, "services", "auth-service");
    mkdirSync(projectRoot, { recursive: true });
    return { gitRoot, projectRoot };
  };

  it("installs hook at gitRoot when projectRoot is different", () => {
    const { gitRoot, projectRoot } = makeMonorepo();
    installHook(projectRoot, gitRoot);

    const hookPath = join(gitRoot, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("telesis");
    expect(content).toContain("preflight");
  });

  it("hook body contains absolute project root path", () => {
    const { gitRoot, projectRoot } = makeMonorepo();
    installHook(projectRoot, gitRoot);

    const hookPath = join(gitRoot, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain(`PROJECT_ROOT="${projectRoot}"`);
  });

  it("hook body cd's to project root before preflight", () => {
    const { gitRoot, projectRoot } = makeMonorepo();
    installHook(projectRoot, gitRoot);

    const hookPath = join(gitRoot, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain('cd "$PROJECT_ROOT"');
  });

  it("uninstalls from gitRoot", () => {
    const { gitRoot, projectRoot } = makeMonorepo();
    installHook(projectRoot, gitRoot);
    uninstallHook(projectRoot, gitRoot);

    const hookPath = join(gitRoot, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).not.toContain("telesis");
  });

  it("isHookInstalled checks gitRoot", () => {
    const { gitRoot, projectRoot } = makeMonorepo();
    expect(isHookInstalled(projectRoot, gitRoot)).toBe(false);
    installHook(projectRoot, gitRoot);
    expect(isHookInstalled(projectRoot, gitRoot)).toBe(true);
  });

  it("throws when gitRoot has no .git", () => {
    const projectRoot = makeTempDir();
    const fakeGitRoot = makeTempDir();
    expect(() => installHook(projectRoot, fakeGitRoot)).toThrow(
      "Not a git repository",
    );
  });

  it("supports multiple projects in one git repo", () => {
    const gitRoot = makeGitRepo();
    const projectA = join(gitRoot, "services", "auth");
    const projectB = join(gitRoot, "services", "billing");
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });

    installHook(projectA, gitRoot);
    installHook(projectB, gitRoot);

    const hookPath = join(gitRoot, ".git", "hooks", "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain(projectA);
    expect(content).toContain(projectB);

    // Both are independently tracked
    expect(isHookInstalled(projectA, gitRoot)).toBe(true);
    expect(isHookInstalled(projectB, gitRoot)).toBe(true);

    // Uninstalling one doesn't affect the other
    uninstallHook(projectA, gitRoot);
    expect(isHookInstalled(projectA, gitRoot)).toBe(false);
    expect(isHookInstalled(projectB, gitRoot)).toBe(true);
  });
});
