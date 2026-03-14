import { execFileSync } from "node:child_process";
import type { CommitResult, PushResult } from "./types.js";

/** Get the current branch name */
export const currentBranch = (rootDir: string): string =>
  execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

/** Resolve a git ref to its full SHA */
export const resolveRef = (rootDir: string, ref: string = "HEAD"): string =>
  execFileSync("git", ["rev-parse", ref], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

/** Check whether the working tree has uncommitted changes (staged or unstaged) */
export const hasChanges = (rootDir: string): boolean => {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();
  return status.length > 0;
};

/** Create and checkout a new branch */
export const createBranch = (rootDir: string, name: string): void => {
  execFileSync("git", ["checkout", "-b", name], {
    cwd: rootDir,
    encoding: "utf-8",
  });
};

/** Stage all changes (tracked and untracked) */
export const stageAll = (rootDir: string): void => {
  execFileSync("git", ["add", "-A"], {
    cwd: rootDir,
    encoding: "utf-8",
  });
};

/** Create a commit with the given message and return a typed result */
export const commit = (rootDir: string, message: string): CommitResult => {
  execFileSync("git", ["commit", "-m", message], {
    cwd: rootDir,
    encoding: "utf-8",
  });

  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

  const branch = currentBranch(rootDir);

  const diffStat = execFileSync(
    "git",
    ["diff", "--stat", "--name-only", "HEAD~1", "HEAD"],
    { cwd: rootDir, encoding: "utf-8" },
  ).trim();
  const filesChanged = diffStat.length > 0 ? diffStat.split("\n").length : 0;

  return { sha, branch, message, filesChanged };
};

/** Soft-reset HEAD to a given SHA, preserving all changes as staged */
export const softReset = (rootDir: string, sha: string): void => {
  execFileSync("git", ["reset", "--soft", sha], {
    cwd: rootDir,
    encoding: "utf-8",
  });
};

/** Count files changed in the HEAD commit (works even for the initial commit) */
const countFilesInCommit = (rootDir: string): number => {
  const output = execFileSync(
    "git",
    ["show", "--name-only", "--format=", "HEAD"],
    { cwd: rootDir, encoding: "utf-8" },
  ).trim();
  return output.length > 0 ? output.split("\n").length : 0;
};

/** Amend the most recent commit (no message change) and return updated result */
export const amendCommit = (rootDir: string): CommitResult => {
  execFileSync("git", ["commit", "--amend", "--no-edit"], {
    cwd: rootDir,
    encoding: "utf-8",
  });

  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

  const branch = currentBranch(rootDir);

  const message = execFileSync("git", ["log", "-1", "--format=%s"], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

  const filesChanged = countFilesInCommit(rootDir);

  return { sha, branch, message, filesChanged };
};

/** Push a branch to the remote */
export const push = (
  rootDir: string,
  branch: string,
  setUpstream: boolean = false,
): PushResult => {
  const args = setUpstream
    ? ["push", "--set-upstream", "origin", branch]
    : ["push", "origin", branch];

  execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf-8",
  });

  return { branch, remote: "origin" };
};

/** Check whether a remote branch exists */
export const remoteBranchExists = (
  rootDir: string,
  branch: string,
): boolean => {
  try {
    const result = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin", branch],
      { cwd: rootDir, encoding: "utf-8" },
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
};
