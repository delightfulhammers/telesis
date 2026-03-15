import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import {
  listReviewSessions,
  loadReviewSession,
} from "../../agent/review/store.js";
import { runReview } from "../../agent/review/pipeline.js";

import type { ModelClientFactory } from "../types.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
  createClient: ModelClientFactory,
): void => {
  server.tool(
    "telesis_review",
    "Run a multi-persona code review against the current diff. LLM-powered — uses tokens and costs money. Typical duration: 30-90 seconds. Requires ANTHROPIC_API_KEY.",
    {
      ref: z
        .string()
        .optional()
        .describe("Review diff against ref (e.g. main, main...HEAD)"),
      all: z
        .boolean()
        .optional()
        .describe("Review working + staged changes (default: staged only)"),
      single: z
        .boolean()
        .optional()
        .describe("Use single-pass review instead of multi-persona"),
      personas: z
        .string()
        .max(200)
        .optional()
        .describe("Comma-separated persona slugs to use"),
      dedup: z
        .boolean()
        .optional()
        .describe("Enable cross-persona deduplication (default: true)"),
      themes: z
        .boolean()
        .optional()
        .describe("Enable cross-round theme extraction (default: true)"),
      verify: z
        .boolean()
        .optional()
        .describe("Enable full-file verification pass (default: true)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({
      ref,
      all,
      single,
      personas,
      dedup,
      themes,
      verify,
      projectRoot,
    }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const sessionId = randomUUID();
        const client = createClient(rootDir, sessionId, "review");

        const result = await runReview(client, rootDir, {
          ref,
          all,
          single,
          personas,
          dedup,
          themes,
          verify,
          sessionId,
        });

        if (result.noChanges) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: "No changes to review",
                    ref: result.noChangesRef,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

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
    "telesis_review_list",
    "List past review sessions with metadata",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const sessions = listReviewSessions(rootDir);
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
    "telesis_review_show",
    "Show findings from a past review session by ID",
    {
      sessionId: z.string().describe("Review session ID"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ sessionId, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const data = loadReviewSession(rootDir, sessionId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
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
