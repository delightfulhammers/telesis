import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { appendEntry, loadEntries, findEntry } from "../../journal/store.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_journal_add",
    "Add a design journal entry",
    {
      title: z.string().max(200).describe("Entry title (max 200 chars)"),
      body: z.string().max(10000).describe("Entry body text"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ title, body, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const entry = appendEntry(rootDir, title, body);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(entry, null, 2),
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
    "telesis_journal_list",
    "List all design journal entries",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const { items } = loadEntries(rootDir);
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
    "telesis_journal_show",
    "Show a specific journal entry by ID, date (YYYY-MM-DD), or title substring",
    {
      query: z
        .string()
        .max(500)
        .describe("Entry ID, date (YYYY-MM-DD), or title substring"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ query, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const { items } = loadEntries(rootDir);
        const match = findEntry(items, query);

        if (!match) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No journal entry matching "${query}"`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(match, null, 2),
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
