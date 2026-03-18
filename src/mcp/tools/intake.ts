import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { listWorkItems, loadWorkItem } from "../../intake/store.js";
import { syncFromSource } from "../../intake/sync.js";
import { createGitHubSource } from "../../intake/github-source.js";
import {
  extractRepoContext,
  resolveGitHubToken,
} from "../../github/environment.js";
import { loadRawConfig, parseIntakeConfig } from "../../config/config.js";
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

        const repoCtx = extractRepoContext();
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
};
