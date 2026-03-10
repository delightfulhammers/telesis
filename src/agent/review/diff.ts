import { execFileSync } from "node:child_process";
import type { ChangedFile, ResolvedDiff } from "./types.js";

const EMPTY_DIFF: ResolvedDiff = { diff: "", files: [], ref: "" };

const parseStatus = (code: string): ChangedFile["status"] => {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code.startsWith("R")) return "renamed";
  return "modified";
};

const parseChangedFiles = (
  rootDir: string,
  args: readonly string[],
): readonly ChangedFile[] => {
  const raw = execFileSync("git", ["diff", "--name-status", ...args], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

  if (raw.length === 0) return [];

  return raw.split("\n").map((line) => {
    const [status, ...rest] = line.split("\t");
    const path = rest.at(-1) ?? "";
    return { path, status: parseStatus(status) };
  });
};

const getDiff = (rootDir: string, args: readonly string[]): string =>
  execFileSync("git", ["diff", ...args], {
    cwd: rootDir,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

const describeRef = (ref?: string, all?: boolean): string => {
  if (ref) return ref;
  if (all) return "working + staged changes";
  return "staged changes";
};

const gitArgs = (ref?: string, all?: boolean): readonly string[] => {
  if (ref) return [ref];
  if (all) return ["HEAD"];
  return ["--cached"];
};

export const resolveDiff = (
  rootDir: string,
  ref?: string,
  all?: boolean,
): ResolvedDiff => {
  const args = gitArgs(ref, all);
  const diff = getDiff(rootDir, args);
  const refDescription = describeRef(ref, all);

  if (diff.trim().length === 0) {
    return { ...EMPTY_DIFF, ref: refDescription };
  }

  const files = parseChangedFiles(rootDir, args);
  return { diff, files, ref: refDescription };
};
