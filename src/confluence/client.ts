/** Confluence REST API client — fetches pages and converts to markdown. */

import type {
  ConfluenceClientConfig,
  ConfluencePage,
  ConfluenceSearchResponse,
} from "./types.js";
import { buildAuthHeader } from "../jira/auth.js";

export class ConfluenceApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfluenceApiError";
  }
}

const RETRY_DELAY_MS = 2000;
const MAX_PAGES = 10;
const PER_PAGE = 25;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const headers = (config: ConfluenceClientConfig): Record<string, string> => ({
  Authorization: buildAuthHeader(config.auth),
  Accept: "application/json",
});

const handleResponse = async (
  response: Response,
  context: string,
): Promise<unknown> => {
  if (response.ok) return response.json();

  const body = await response.text();

  if (response.status === 401) {
    throw new ConfluenceApiError(
      401,
      body,
      `Confluence authentication failed (${context}). Check JIRA_TOKEN/JIRA_EMAIL.`,
    );
  }

  throw new ConfluenceApiError(
    response.status,
    body,
    `Confluence API error ${response.status} (${context}): ${body}`,
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
  } catch {
    await sleep(RETRY_DELAY_MS);
    try {
      response = await fetch(url, opts);
    } catch (retryErr) {
      throw new ConfluenceApiError(
        0,
        "",
        `Confluence network error on retry (${context}): ${String(retryErr)}`,
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
      throw new ConfluenceApiError(
        0,
        "",
        `Confluence network error on 5xx retry (${context}): ${String(retryErr)}`,
      );
    }
    return handleResponse(retry, context);
  }

  return handleResponse(response, context);
};

/** Fetch all pages in a Confluence space with pagination. */
export const fetchSpacePages = async (
  config: ConfluenceClientConfig,
  spaceKey: string,
): Promise<readonly ConfluencePage[]> => {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    throw new ConfluenceApiError(
      0,
      "",
      `Confluence baseUrl must use HTTPS: ${base}`,
    );
  }

  const allPages: ConfluencePage[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PER_PAGE;
    const url =
      `${base}/rest/api/content?spaceKey=${encodeURIComponent(spaceKey)}` +
      `&type=page&expand=body.storage&start=${start}&limit=${PER_PAGE}`;

    const data = (await fetchWithRetry(
      url,
      { method: "GET", headers: headers(config) },
      "fetch space pages",
    )) as ConfluenceSearchResponse;

    allPages.push(...data.results);

    if (!data._links.next || data.size < PER_PAGE) break;
  }

  return allPages;
};

/** Fetch a single Confluence page by ID with body content. */
export const fetchPage = async (
  config: ConfluenceClientConfig,
  pageId: string,
): Promise<ConfluencePage> => {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    throw new ConfluenceApiError(
      0,
      "",
      `Confluence baseUrl must use HTTPS: ${base}`,
    );
  }

  const url = `${base}/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage`;

  return (await fetchWithRetry(
    url,
    { method: "GET", headers: headers(config) },
    "fetch page",
  )) as ConfluencePage;
};
