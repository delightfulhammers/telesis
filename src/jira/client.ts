import type {
  JiraClientConfig,
  JiraIssue,
  JiraSearchResponse,
} from "./types.js";
import { buildAuthHeader } from "./auth.js";

export class JiraApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "JiraApiError";
  }
}

const RETRY_DELAY_MS = 2000;
const MAX_RESULTS_PER_PAGE = 100;
const MAX_PAGES = 10;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const headers = (config: JiraClientConfig): Record<string, string> => ({
  Authorization: buildAuthHeader(config.auth),
  Accept: "application/json",
  "Content-Type": "application/json",
});

const handleResponse = async (
  response: Response,
  context: string,
): Promise<unknown> => {
  if (response.ok) return response.json();

  const body = await response.text();

  if (response.status === 401) {
    throw new JiraApiError(
      401,
      body,
      `Jira authentication failed (${context}). ` +
        "Check JIRA_TOKEN (and JIRA_EMAIL for Jira Cloud). " +
        `Response: ${body}`,
    );
  }

  if (response.status === 403) {
    throw new JiraApiError(
      403,
      body,
      `Jira permission denied (${context}). ` +
        "Ensure the token has the required project permissions. " +
        `Response: ${body}`,
    );
  }

  throw new JiraApiError(
    response.status,
    body,
    `Jira API error ${response.status} (${context}): ${body}`,
  );
};

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  context: string,
): Promise<unknown> => {
  const opts: RequestInit = { ...init, redirect: "error" };

  let response: Response;
  try {
    response = await fetch(url, opts);
  } catch (err) {
    // Network error (DNS failure, connection refused) — retry once
    await sleep(RETRY_DELAY_MS);
    try {
      response = await fetch(url, opts);
    } catch (retryErr) {
      throw new JiraApiError(
        0,
        "",
        `Jira network error on retry (${context}): ${String(retryErr)}`,
      );
    }
    return handleResponse(response, context);
  }

  if (response.status >= 500) {
    await response.text();
    await sleep(RETRY_DELAY_MS);
    let retry: Response;
    try {
      retry = await fetch(url, opts);
    } catch (retryErr) {
      throw new JiraApiError(
        0,
        "",
        `Jira network error on 5xx retry (${context}): ${String(retryErr)}`,
      );
    }
    return handleResponse(retry, context);
  }

  return handleResponse(response, context);
};

/**
 * Search Jira issues using JQL with pagination.
 * Uses POST /rest/api/2/search to avoid URL length limits with complex JQL.
 * Paginates until all results are fetched or MAX_PAGES is reached.
 */
export const searchIssues = async (
  config: JiraClientConfig,
  jql: string,
  maxResults: number = MAX_RESULTS_PER_PAGE,
): Promise<readonly JiraIssue[]> => {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    throw new JiraApiError(0, "", `Jira baseUrl must use HTTPS: ${base}`);
  }
  let hostname: string;
  try {
    hostname = new URL(base).hostname;
  } catch {
    throw new JiraApiError(0, "", `Invalid Jira baseUrl: ${base}`);
  }
  if (!hostname) {
    throw new JiraApiError(0, "", `Invalid Jira baseUrl: ${base}`);
  }
  const BLOCKED_HOST_RE =
    /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1)/;
  if (BLOCKED_HOST_RE.test(hostname)) {
    throw new JiraApiError(
      0,
      "",
      `Jira baseUrl must not target localhost or private IP ranges: ${base}`,
    );
  }
  const url = `${base}/rest/api/2/search`;
  const allIssues: JiraIssue[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const startAt = page * maxResults;

    const data = (await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          jql,
          startAt,
          maxResults,
          fields: [
            "summary",
            "description",
            "status",
            "priority",
            "assignee",
            "labels",
            "issuetype",
          ],
        }),
      },
      "search issues",
    )) as JiraSearchResponse;

    allIssues.push(...data.issues);

    if (startAt + data.issues.length >= data.total) break;
  }

  return allIssues;
};
