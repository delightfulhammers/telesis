import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import {
  listSessions,
  loadSessionMeta,
  loadSessionEvents,
} from "../../dispatch/store.js";
import { reconstructSessionText } from "../../dispatch/reconstruct.js";
import { dispatch } from "../../dispatch/dispatcher.js";
import { createAcpxAdapter } from "../../dispatch/acpx-adapter.js";
import { loadRawConfig, parseDispatchConfig } from "../../config/config.js";
import type { TelesisDaemonEvent } from "../../daemon/types.js";

const ALLOWED_AGENTS = new Set(["claude", "codex", "gemini", "dummy"]);
const DISPATCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_dispatch_list",
    "List dispatch sessions (coding agent invocations)",
    {
      limit: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Maximum sessions to return (default: 20)"),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Skip this many sessions (for pagination)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ limit, offset, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const allSessions = listSessions(rootDir);
        const start = offset ?? 0;
        const pageSize = Math.min(limit ?? 20, 200);
        const sessions = allSessions.slice(start, start + pageSize);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  sessions,
                  total: allSessions.length,
                  offset: start,
                  limit: pageSize,
                  hasMore: start + pageSize < allSessions.length,
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
    "telesis_dispatch_show",
    "Show a dispatch session by ID or prefix. Use text mode for a compact narrative instead of raw events.",
    {
      id: z.string().describe("Session ID or prefix"),
      text: z
        .boolean()
        .optional()
        .describe(
          "Return reconstructed narrative text instead of raw events (much smaller)",
        ),
      limit: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Maximum events to return in raw mode (default: 100)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ id, text, limit, projectRoot }) => {
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

        if (text) {
          const narrative = reconstructSessionText(events);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { meta, eventCount: events.length, text: narrative },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const maxEvents = Math.min(limit ?? 100, 500);
        const truncated = events.slice(0, maxEvents);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  meta,
                  events: truncated,
                  totalEvents: events.length,
                  truncated: events.length > maxEvents,
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
    "telesis_dispatch_run",
    "Dispatch a coding agent with a task. Long-running — may take minutes. Times out after 10 minutes.",
    {
      task: z.string().max(10000).describe("Task description for the agent"),
      agent: z
        .string()
        .optional()
        .describe(
          `Agent to use (default: from config or 'claude'). Allowed: ${[...ALLOWED_AGENTS].join(", ")}`,
        ),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ task, agent, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const rawConfig = loadRawConfig(rootDir);
        const config = parseDispatchConfig(rawConfig);

        const selectedAgent = agent ?? config.defaultAgent ?? "claude";
        if (!ALLOWED_AGENTS.has(selectedAgent)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown agent '${selectedAgent}'. Allowed: ${[...ALLOWED_AGENTS].join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const adapter = createAcpxAdapter({
          acpxPath: config.acpxPath,
        });

        // Collect events for summary in response
        const events: TelesisDaemonEvent[] = [];
        const onEvent = (event: TelesisDaemonEvent): void => {
          events.push(event);
        };

        // Race dispatch against timeout
        const dispatchPromise = dispatch(
          {
            rootDir,
            adapter,
            onEvent,
            maxConcurrent: config.maxConcurrent,
          },
          selectedAgent,
          task,
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Dispatch timed out after 10 minutes")),
            DISPATCH_TIMEOUT_MS,
          ),
        );

        const result = await Promise.race([dispatchPromise, timeoutPromise]);

        const errorEvents = events.filter(
          (e) =>
            e.type === "dispatch:session:failed" ||
            e.type === "oversight:intervention",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...result,
                  eventCount: events.length,
                  errorEvents: errorEvents.length > 0 ? errorEvents : undefined,
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
};
