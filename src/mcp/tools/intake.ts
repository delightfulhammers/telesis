import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { listWorkItems, loadWorkItem } from "../../intake/store.js";
import type { WorkItemStatus } from "../../intake/types.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_intake_list",
    "List work items imported from external sources. By default shows only active items (pending, approved, dispatching).",
    {
      all: z
        .boolean()
        .optional()
        .describe("Show all statuses (default: active only)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ all, projectRoot }) => {
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
        const items = listWorkItems(rootDir, filter);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(items, null, 2),
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
};
