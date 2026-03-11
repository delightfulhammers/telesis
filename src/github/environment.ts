import { readFileSync } from "node:fs";
import type { GitHubPRContext } from "./types.js";

/** Returns true when running inside GitHub Actions. */
export const isGitHubActions = (): boolean =>
  process.env.GITHUB_ACTIONS === "true";

/**
 * Extracts PR context from the GitHub Actions environment.
 * Returns null when not running in a PR context (e.g., push events, schedule,
 * or when required env vars are missing).
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

  const number = pr.number as number | undefined;
  const head = pr.head as Record<string, unknown> | undefined;
  const sha = head?.sha as string | undefined;

  const repo = payload.repository as Record<string, unknown> | undefined;
  const fullName = repo?.full_name as string | undefined;

  if (!number || !sha || !fullName) return null;

  const [owner, repoName] = fullName.split("/");
  if (!owner || !repoName) return null;

  return {
    owner,
    repo: repoName,
    pullNumber: number,
    commitSha: sha,
    token,
  };
};
