import type { IntakeGitHubConfig } from "../config/config.js";
import { listRepoIssues } from "../github/client.js";
import type { GitHubIssue } from "../github/types.js";
import type { IntakeSource, RawIssue } from "./source.js";

/** Convert a GitHub issue to a RawIssue for normalization */
const toRawIssue = (issue: GitHubIssue): RawIssue => ({
  sourceId: String(issue.number),
  sourceUrl: issue.html_url,
  title: issue.title,
  body: issue.body ?? "",
  labels: issue.labels.map((l) => l.name),
  assignee: issue.assignee?.login,
});

/** Check if an issue should be excluded based on excludeLabels config */
const hasExcludedLabel = (
  issue: GitHubIssue,
  excludeLabels: readonly string[],
): boolean => issue.labels.some((l) => excludeLabels.includes(l.name));

/** Create a GitHub IntakeSource adapter */
export const createGitHubSource = (
  config: IntakeGitHubConfig | undefined,
  owner: string,
  repo: string,
  token: string,
): IntakeSource => ({
  kind: "github",
  fetchIssues: async (): Promise<readonly RawIssue[]> => {
    // Filter out labels containing commas to prevent silent API filter expansion
    const safeLabels = config?.labels?.filter((l) => !l.includes(","));
    if (
      config?.labels &&
      safeLabels &&
      safeLabels.length < config.labels.length
    ) {
      const dropped = config.labels.filter((l) => l.includes(","));
      process.stderr.write(
        `[telesis] Warning: labels containing commas were ignored: ${dropped.join(", ")}\n`,
      );
    }
    const issues = await listRepoIssues(owner, repo, token, {
      labels: safeLabels?.length ? safeLabels.join(",") : undefined,
      assignee: config?.assignee,
      state: config?.state ?? "open",
    });

    const excludeLabels = config?.excludeLabels ?? [];
    const filtered =
      excludeLabels.length > 0
        ? issues.filter((i) => !hasExcludedLabel(i, excludeLabels))
        : issues;

    return filtered.map(toRawIssue);
  },
});
