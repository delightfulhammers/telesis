import type { JiraAuth } from "./types.js";

/**
 * Resolve Jira auth from environment variables.
 *
 * - JIRA_TOKEN + JIRA_EMAIL → Basic auth (Jira Cloud: email:api_token base64)
 * - JIRA_TOKEN alone → Bearer auth (Jira Server/Data Center PAT)
 * - Returns null if JIRA_TOKEN is not set.
 */
const SAFE_TOKEN_RE = /^[\x20-\x7E]{10,512}$/;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const resolveJiraAuth = (): JiraAuth | null => {
  const token = process.env.JIRA_TOKEN;
  if (!token || !SAFE_TOKEN_RE.test(token)) return null;

  const email = process.env.JIRA_EMAIL;
  if (email) {
    if (!BASIC_EMAIL_RE.test(email)) {
      process.stderr.write(
        "[telesis] Warning: JIRA_EMAIL does not look like a valid email address\n",
      );
      return null;
    }
    return { mode: "basic", token, email };
  }

  return { mode: "bearer", token };
};

/** Build the Authorization header value for a Jira API call. */
export const buildAuthHeader = (auth: JiraAuth): string => {
  if (auth.mode === "basic" && auth.email) {
    const encoded = Buffer.from(`${auth.email}:${auth.token}`).toString(
      "base64",
    );
    return `Basic ${encoded}`;
  }
  return `Bearer ${auth.token}`;
};
