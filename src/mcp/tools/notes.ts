import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { appendNote, loadNotes } from "../../notes/store.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_note_add",
    "Add a development note with optional tags",
    {
      text: z.string().max(4096).describe("Note text (max 4096 chars)"),
      tags: z
        .array(z.string().max(64))
        .optional()
        .describe("Tags for the note (max 64 chars each)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ text, tags, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const note = appendNote(rootDir, text, tags ?? []);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(note, null, 2),
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
    "telesis_note_list",
    "List development notes, optionally filtered by tag",
    {
      tag: z.string().max(64).optional().describe("Filter by tag"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ tag, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const { items } = loadNotes(rootDir);
        const filtered = tag
          ? items.filter((n) => n.tags.includes(tag))
          : items;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(filtered, null, 2),
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
