import { readFileSync } from "node:fs";
import type { GitHubPRContext } from "./types.js";

const SAFE_NAME_RE = /^[\w.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/i;

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

  const [owner, repoName] = fullName.split("/");
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
