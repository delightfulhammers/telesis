import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { GitHubPRContext } from "./types.js";

const SAFE_NAME_RE = /^[\w.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/i;
const GITHUB_REMOTE_RE = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/;

/** Returns true when running inside GitHub Actions. */
export const isGitHubActions = (): boolean =>
  process.env.GITHUB_ACTIONS === "true";

/**
 * Extracts PR context from the GitHub Actions environment.
 * Returns null when not running in a PR context (e.g., push events, schedule,
 * or when required env vars are missing).
 *
 * Validates all extracted fields to prevent malformed payloads from producing
 * invalid API URLs.
 */
export const extractPRContext = (): GitHubPRContext | null => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(readFileSync(eventPath, "utf-8"));
  } catch {
    return null;
  }

  const pr = payload.pull_request as Record<string, unknown> | undefined;
  if (!pr) return null;

  const number = pr.number;
  const head = pr.head as Record<string, unknown> | undefined;
  const sha = head?.sha;

  const repo = payload.repository as Record<string, unknown> | undefined;
  const fullName = repo?.full_name as string | undefined;

  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0)
    return null;
  if (typeof sha !== "string" || !SHA_RE.test(sha)) return null;
  if (!fullName) return null;

  const parts = fullName.split("/");
  if (parts.length !== 2) return null;
  const [owner, repoName] = parts;
  if (!owner || !repoName) return null;
  if (!SAFE_NAME_RE.test(owner) || !SAFE_NAME_RE.test(repoName)) return null;

  return {
    owner,
    repo: repoName,
    pullNumber: number,
    commitSha: sha,
    token,
  };
};

/**
 * Extracts owner/repo from the git remote URL.
 * Tries GITHUB_REPOSITORY env var first (CI), then parses the origin remote.
 */
export const extractRepoContext = (): {
  owner: string;
  repo: string;
} | null => {
  // CI shortcut
  const ghRepo = process.env.GITHUB_REPOSITORY;
  if (ghRepo) {
    const parts = ghRepo.split("/");
    if (
      parts.length === 2 &&
      parts[0] &&
      parts[1] &&
      SAFE_NAME_RE.test(parts[0]) &&
      SAFE_NAME_RE.test(parts[1])
    ) {
      return { owner: parts[0], repo: parts[1] };
    }
  }

  // Parse from git remote
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = GITHUB_REMOTE_RE.exec(remoteUrl);
    if (
      match &&
      match[1] &&
      match[2] &&
      SAFE_NAME_RE.test(match[1]) &&
      SAFE_NAME_RE.test(match[2])
    ) {
      return { owner: match[1], repo: match[2] };
    }
  } catch {
    // not a git repo or no origin remote
  }

  return null;
};

/**
 * Builds a GitHubPRContext for local use (outside CI).
 * Requires GITHUB_TOKEN and a PR number. Infers owner/repo from git remote.
 */
export const buildLocalPRContext = (
  pullNumber: number,
): GitHubPRContext | null => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const repoCtx = extractRepoContext();
  if (!repoCtx) return null;

  let commitSha = "0000000000000000000000000000000000000000";
  try {
    const raw = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (SHA_RE.test(raw)) {
      commitSha = raw;
    }
  } catch {
    // use placeholder
  }

  return {
    ...repoCtx,
    pullNumber,
    commitSha,
    token,
  };
};
