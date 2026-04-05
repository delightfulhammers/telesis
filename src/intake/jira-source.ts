import type { IntakeJiraConfig } from "../config/config.js";
import { searchIssues } from "../jira/client.js";
import type { JiraAuth, JiraIssue } from "../jira/types.js";
import type { IntakeSource, RawIssue } from "./source.js";

/** Convert a Jira issue to a RawIssue for normalization */
const toRawIssue = (issue: JiraIssue, baseUrl: string): RawIssue => ({
  sourceId: issue.key,
  sourceUrl: `${baseUrl.replace(/\/+$/, "")}/browse/${issue.key}`,
  title: issue.fields.summary,
  body: issue.fields.description ?? "",
  labels: [...issue.fields.labels],
  assignee: issue.fields.assignee?.displayName,
  priority: issue.fields.priority?.name,
});

/** Escape a string value for safe inclusion in a JQL query */
const jqlEscape = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Build a JQL query from config filter fields.
 * Returns a query string like:
 *   project = "PROJ" AND labels IN ("ready") AND status IN ("To Do") ORDER BY ...
 */
export const buildJql = (config: IntakeJiraConfig): string => {
  const clauses: string[] = [];

  if (config.project) {
    clauses.push(`project = ${jqlEscape(config.project)}`);
  }

  if (config.labels && config.labels.length > 0) {
    const values = config.labels.map(jqlEscape).join(", ");
    clauses.push(`labels IN (${values})`);
  }

  if (config.assignee) {
    clauses.push(`assignee = ${jqlEscape(config.assignee)}`);
  }

  if (config.status && config.status.length > 0) {
    const values = config.status.map(jqlEscape).join(", ");
    clauses.push(`status IN (${values})`);
  }

  if (config.issueTypes && config.issueTypes.length > 0) {
    const values = config.issueTypes.map(jqlEscape).join(", ");
    clauses.push(`issuetype IN (${values})`);
  }

  const ORDER = "ORDER BY priority DESC, created ASC";
  const where = clauses.join(" AND ");
  return where ? `${where} ${ORDER}` : ORDER;
};

/** Create a Jira IntakeSource adapter */
export const createJiraSource = (
  config: IntakeJiraConfig,
  auth: JiraAuth,
): IntakeSource => ({
  kind: "jira",
  fetchIssues: async (): Promise<readonly RawIssue[]> => {
    const jql = config.jql ?? buildJql(config);
    const clientConfig = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      auth,
    };
    const issues = await searchIssues(clientConfig, jql);
    return issues.map((i) => toRawIssue(i, clientConfig.baseUrl));
  },
});
