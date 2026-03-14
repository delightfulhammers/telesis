import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  currentBranch,
  hasChanges,
  createBranch,
  stageAll,
  commit,
  amendCommit,
  softReset,
  push,
  remoteBranchExists,
} from "./operations.js";

const makeTempDir = useTempDir("git-ops");

/** Initialize a git repo with an initial commit */
const initGitRepo = (dir: string): void => {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# Test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir });
};

/** Create a bare remote and add it as origin */
const initBareRemote = (repoDir: string): string => {
  const remoteDir = repoDir + "-remote.git";
  execFileSync("git", ["init", "--bare", remoteDir]);
  execFileSync("git", ["remote", "add", "origin", remoteDir], {
    cwd: repoDir,
  });
  return remoteDir;
};

describe("currentBranch", () => {
  it("returns the current branch name", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    // Default branch may be 'main' or 'master' depending on git config
    const branch = currentBranch(dir);
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });

  it("returns newly created branch name", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    execFileSync("git", ["checkout", "-b", "feature/test"], { cwd: dir });

    expect(currentBranch(dir)).toBe("feature/test");
  });
});

describe("hasChanges", () => {
  it("returns false for clean working tree", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    expect(hasChanges(dir)).toBe(false);
  });

  it("returns true for untracked files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "new.ts"), "export const x = 1;\n");

    expect(hasChanges(dir)).toBe(true);
  });

  it("returns true for modified files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "README.md"), "# Updated\n");

    expect(hasChanges(dir)).toBe(true);
  });

  it("returns true for staged files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "README.md"), "# Updated\n");
    execFileSync("git", ["add", "."], { cwd: dir });

    expect(hasChanges(dir)).toBe(true);
  });
});

describe("createBranch", () => {
  it("creates and switches to a new branch", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    createBranch(dir, "telesis/test-branch");
    expect(currentBranch(dir)).toBe("telesis/test-branch");
  });

  it("throws when branch already exists", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    createBranch(dir, "telesis/dup");
    execFileSync("git", ["checkout", "-"], { cwd: dir });

    expect(() => createBranch(dir, "telesis/dup")).toThrow();
  });
});

describe("stageAll", () => {
  it("stages untracked and modified files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "new.ts"), "export const x = 1;\n");
    writeFileSync(join(dir, "README.md"), "# Updated\n");

    stageAll(dir);

    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: dir,
      encoding: "utf-8",
    });
    // All files should be staged (prefixed with A or M, not ??)
    const lines = status.trim().split("\n");
    for (const line of lines) {
      expect(line).not.toMatch(/^\?\?/);
    }
  });
});

describe("commit", () => {
  it("creates a commit and returns typed result", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "new.ts"), "export const x = 1;\n");
    execFileSync("git", ["add", "."], { cwd: dir });

    const result = commit(dir, "test commit message");

    expect(result.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(result.message).toBe("test commit message");
    expect(result.filesChanged).toBe(1);
    expect(typeof result.branch).toBe("string");
  });

  it("counts multiple changed files", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "a.ts"), "a\n");
    writeFileSync(join(dir, "b.ts"), "b\n");
    writeFileSync(join(dir, "c.ts"), "c\n");
    execFileSync("git", ["add", "."], { cwd: dir });

    const result = commit(dir, "three files");
    expect(result.filesChanged).toBe(3);
  });

  it("throws when nothing to commit", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    expect(() => commit(dir, "empty commit")).toThrow();
  });
});

describe("amendCommit", () => {
  it("amends the last commit and returns updated result", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    writeFileSync(join(dir, "a.ts"), "a\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    const original = commit(dir, "first commit");

    // Modify a file, stage, and amend
    writeFileSync(join(dir, "b.ts"), "b\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    const amended = amendCommit(dir);

    // SHA should change
    expect(amended.sha).not.toBe(original.sha);
    expect(amended.sha).toMatch(/^[a-f0-9]{40}$/);

    // Message should be preserved
    expect(amended.message).toBe("first commit");

    // Files changed should include both files
    expect(amended.filesChanged).toBe(2);

    // Commit count should not increase (still 2: initial + first commit)
    const commitCount = execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
    expect(commitCount).toBe("2");
  });

  it("preserves branch name", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    createBranch(dir, "feature/amend-test");
    writeFileSync(join(dir, "a.ts"), "a\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    commit(dir, "on branch");

    writeFileSync(join(dir, "b.ts"), "b\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    const amended = amendCommit(dir);

    expect(amended.branch).toBe("feature/amend-test");
  });
});

describe("softReset", () => {
  it("resets HEAD to a given SHA preserving changes as staged", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    // Get SHA of initial commit
    const initialSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();

    // Make two more commits (simulating agent commits)
    writeFileSync(join(dir, "a.ts"), "a\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "agent commit 1"], { cwd: dir });

    writeFileSync(join(dir, "b.ts"), "b\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "agent commit 2"], { cwd: dir });

    // Verify we have 3 commits
    const countBefore = execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
    expect(countBefore).toBe("3");

    // Soft reset to initial commit
    softReset(dir, initialSha);

    // Should be back to 1 commit
    const countAfter = execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
    expect(countAfter).toBe("1");

    // But all files should still be staged
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
    expect(status).toContain("A  a.ts");
    expect(status).toContain("A  b.ts");
  });

  it("preserves unstaged changes alongside reset", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    const initialSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();

    // Agent commits one file
    writeFileSync(join(dir, "committed.ts"), "committed\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "agent commit"], { cwd: dir });

    // Unstaged file exists
    writeFileSync(join(dir, "unstaged.ts"), "unstaged\n");

    softReset(dir, initialSha);

    // Both files should be present
    expect(hasChanges(dir)).toBe(true);
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
    expect(status).toContain("committed.ts");
    expect(status).toContain("unstaged.ts");
  });
});

describe("push", () => {
  it("pushes to a bare remote", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    initBareRemote(dir);

    // Push the current branch
    const branch = currentBranch(dir);
    const result = push(dir, branch, true);

    expect(result.branch).toBe(branch);
    expect(result.remote).toBe("origin");
  });

  it("pushes with set-upstream for new branches", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    initBareRemote(dir);

    // Push main first so remote has content
    const mainBranch = currentBranch(dir);
    push(dir, mainBranch, true);

    createBranch(dir, "telesis/new-branch");
    writeFileSync(join(dir, "feature.ts"), "export const f = 1;\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "feature"], { cwd: dir });

    const result = push(dir, "telesis/new-branch", true);
    expect(result.branch).toBe("telesis/new-branch");
  });
});

describe("remoteBranchExists", () => {
  it("returns false when no remote configured", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    expect(remoteBranchExists(dir, "main")).toBe(false);
  });

  it("returns true for pushed branch", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    initBareRemote(dir);

    const branch = currentBranch(dir);
    push(dir, branch, true);

    expect(remoteBranchExists(dir, branch)).toBe(true);
  });

  it("returns false for non-existent branch", () => {
    const dir = makeTempDir();
    initGitRepo(dir);
    initBareRemote(dir);

    const branch = currentBranch(dir);
    push(dir, branch, true);

    expect(remoteBranchExists(dir, "nonexistent")).toBe(false);
  });
});
