import {
  API_BASE,
  SAFE_NAME_RE,
  GitHubApiError,
  headers,
  fetchWithRetry,
} from "./http.js";

/** Create a pull request and return its number and URL */
export const createPullRequest = async (params: {
  readonly owner: string;
  readonly repo: string;
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
}): Promise<{ number: number; url: string }> => {
  if (!SAFE_NAME_RE.test(params.owner) || !SAFE_NAME_RE.test(params.repo)) {
    throw new GitHubApiError(
      0,
      "",
      `Invalid owner or repo name: ${params.owner}/${params.repo}`,
    );
  }

  const url = `${API_BASE}/repos/${params.owner}/${params.repo}/pulls`;

  const data = (await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: headers(params.token),
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
      }),
    },
    "create pull request",
  )) as { number: number; html_url: string };

  return { number: data.number, url: data.html_url };
};

/** Close a GitHub issue by setting its state to "closed" */
export const closeIssue = async (
  owner: string,
  repo: string,
  token: string,
  issueNumber: number,
): Promise<void> => {
  if (!SAFE_NAME_RE.test(owner) || !SAFE_NAME_RE.test(repo)) {
    throw new GitHubApiError(
      0,
      "",
      `Invalid owner or repo name: ${owner}/${repo}`,
    );
  }

  const url = `${API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}`;

  await fetchWithRetry(
    url,
    {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify({ state: "closed" }),
    },
    "close issue",
  );
};

/** Post a comment on a GitHub issue */
export const commentOnIssue = async (
  owner: string,
  repo: string,
  token: string,
  issueNumber: number,
  body: string,
): Promise<void> => {
  if (!SAFE_NAME_RE.test(owner) || !SAFE_NAME_RE.test(repo)) {
    throw new GitHubApiError(
      0,
      "",
      `Invalid owner or repo name: ${owner}/${repo}`,
    );
  }

  const url = `${API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ body }),
    },
    "comment on issue",
  );
};
