import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import {
  listSessions,
  loadSessionMeta,
  loadSessionEvents,
} from "../../dispatch/store.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_dispatch_list",
    "List dispatch sessions (coding agent invocations)",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const sessions = listSessions(rootDir);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sessions, null, 2),
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
    "telesis_dispatch_show",
    "Show a dispatch session's metadata and event log by ID or prefix",
    {
      id: z.string().describe("Session ID or prefix"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ id, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const meta = loadSessionMeta(rootDir, id);

        if (!meta) {
          return {
            content: [
              { type: "text" as const, text: `No session matching "${id}"` },
            ],
            isError: true,
          };
        }

        const { items: events } = loadSessionEvents(rootDir, meta.id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ meta, events }, null, 2),
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
