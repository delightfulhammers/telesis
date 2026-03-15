import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { getStatus } from "../../status/status.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_status",
    "Get project status: name, milestone, ADR/TDD counts, token usage, and estimated cost",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const status = await getStatus(rootDir);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(status, null, 2),
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
