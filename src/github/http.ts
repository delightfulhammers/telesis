/** Shared HTTP helpers for GitHub API operations */

export const API_BASE = "https://api.github.com";
export const SAFE_NAME_RE = /^[\w.-]+$/;
export const RETRY_DELAY_MS = 2000;

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export const headers = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const handleResponse = async (
  response: Response,
  context: string,
): Promise<unknown> => {
  if (response.ok) return response.json();

  const body = await response.text();

  if (response.status === 403) {
    throw new GitHubApiError(
      403,
      body,
      `GitHub API permission denied (${context}). ` +
        "Ensure GITHUB_TOKEN has the required permissions. " +
        `Response: ${body}`,
    );
  }

  throw new GitHubApiError(
    response.status,
    body,
    `GitHub API error ${response.status} (${context}): ${body}`,
  );
};

/**
 * Fetch with a single retry on 5xx. Uses a flat delay (not exponential)
 * because we only retry once. Only safe with string bodies — do not use
 * with ReadableStream request bodies.
 */
export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  context: string,
): Promise<unknown> => {
  // Disable redirects to prevent leaking the Authorization header to third-party hosts
  const opts: RequestInit = { ...init, redirect: "error" };
  const response = await fetch(url, opts);

  if (response.status >= 500) {
    // Drain the failed response body to release the connection
    await response.text();
    await sleep(RETRY_DELAY_MS);
    const retry = await fetch(url, opts);
    return handleResponse(retry, context);
  }

  return handleResponse(response, context);
};
