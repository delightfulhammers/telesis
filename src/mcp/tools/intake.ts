import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { listWorkItems, loadWorkItem } from "../../intake/store.js";
import { syncFromSource } from "../../intake/sync.js";
import { createGitHubSource } from "../../intake/github-source.js";
import { createJiraSource } from "../../intake/jira-source.js";
import { resolveJiraAuth } from "../../jira/auth.js";
import {
  extractRepoContext,
  extractDomainFromApiUrl,
  resolveGitHubToken,
} from "../../github/environment.js";
import {
  loadRawConfig,
  parseIntakeConfig,
  resolveGitHubApiBase,
} from "../../config/config.js";
import type { WorkItemStatus } from "../../intake/types.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_intake_list",
    "List work items imported from external sources. By default shows only active items.",
    {
      all: z
        .boolean()
        .optional()
        .describe("Show all statuses (default: active only)"),
      limit: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Maximum items to return (default: 20)"),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Skip this many items (for pagination)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ all, limit, offset, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const filter = all
          ? undefined
          : {
              status: [
                "pending",
                "approved",
                "dispatching",
              ] as WorkItemStatus[],
            };
        const allItems = listWorkItems(rootDir, filter);
        const start = offset ?? 0;
        const pageSize = Math.min(limit ?? 20, 200);
        const items = allItems.slice(start, start + pageSize);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  items,
                  total: allItems.length,
                  offset: start,
                  limit: pageSize,
                  hasMore: start + pageSize < allItems.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: String(err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "telesis_intake_show",
    "Show details of a specific work item by ID or prefix",
    {
      id: z.string().describe("Work item ID or prefix"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ id, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const item = loadWorkItem(rootDir, id);

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No work item matching "${id}"`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(item, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: String(err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "telesis_intake_github",
    "Import open issues from the configured GitHub repository. Requires GITHUB_TOKEN or gh CLI authentication.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const rawConfig = loadRawConfig(rootDir);
        const intakeConfig = parseIntakeConfig(rawConfig);

        const token = resolveGitHubToken();
        if (!token) {
          return {
            content: [
              {
                type: "text" as const,
                text: "GitHub token required. Set GITHUB_TOKEN or authenticate with `gh auth login`.",
              },
            ],
            isError: true,
          };
        }

        if (!intakeConfig.github) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No GitHub intake config found. Add intake.github to .telesis/config.yml.",
              },
            ],
            isError: true,
          };
        }

        const apiBase = resolveGitHubApiBase(rawConfig);
        const domain = extractDomainFromApiUrl(apiBase);
        const repoCtx = extractRepoContext(domain);
        if (!repoCtx) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Could not detect GitHub repo. Set GITHUB_REPOSITORY or ensure a GitHub remote exists.",
              },
            ],
            isError: true,
          };
        }

        const source = createGitHubSource(
          intakeConfig.github,
          repoCtx.owner,
          repoCtx.repo,
          token,
          apiBase,
        );

        const result = await syncFromSource(rootDir, source);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: String(err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "telesis_intake_jira",
    "Import issues from a configured Jira instance. Requires JIRA_TOKEN (and JIRA_EMAIL for Jira Cloud).",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const rawConfig = loadRawConfig(rootDir);
        const intakeConfig = parseIntakeConfig(rawConfig);

        if (!intakeConfig.jira?.baseUrl) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Jira base URL not configured. Add intake.jira.baseUrl to .telesis/config.yml.",
              },
            ],
            isError: true,
          };
        }

        const auth = resolveJiraAuth();
        if (!auth) {
          return {
            content: [
              {
                type: "text" as const,
                text: "JIRA_TOKEN not set. Set JIRA_TOKEN (and JIRA_EMAIL for Jira Cloud).",
              },
            ],
            isError: true,
          };
        }

        const source = createJiraSource(intakeConfig.jira, auth);
        const result = await syncFromSource(rootDir, source);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: String(err) }],
          isError: true,
        };
      }
    },
  );
};
