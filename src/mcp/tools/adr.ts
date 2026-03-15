import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { create } from "../../adr/adr.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_adr_new",
    "Create a new Architecture Decision Record from template. Returns the file path.",
    {
      slug: z
        .string()
        .max(100)
        .regex(
          /^[a-z0-9][a-z0-9-]*$/,
          "Slug must be lowercase alphanumeric with hyphens",
        )
        .describe("ADR slug (lowercase with hyphens, e.g. 'use-postgres')"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ slug, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const path = create(rootDir, slug);
        return {
          content: [{ type: "text" as const, text: `Created ${path}` }],
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
