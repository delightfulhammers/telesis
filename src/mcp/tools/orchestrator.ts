import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import type { ModelClientFactory } from "../types.js";
import { loadContext, saveContext } from "../../orchestrator/persistence.js";
import { createContext } from "../../orchestrator/machine.js";
import { advance } from "../../orchestrator/runner.js";
import { buildRunnerDeps } from "../../orchestrator/deps.js";
import {
  listPendingDecisions,
  resolveDecision,
} from "../../orchestrator/decisions.js";
import { runPreflight } from "../../orchestrator/preflight.js";
import { formatDecisionDetail } from "../../orchestrator/format.js";
import { createBus } from "../../daemon/bus.js";
import type { OrchestratorContext } from "../../orchestrator/types.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
  createClient: ModelClientFactory,
): void => {
  server.tool(
    "telesis_orchestrator_status",
    "Show orchestrator state, active milestone, progress, and pending decisions",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const ctx = loadContext(rootDir);

        if (!ctx) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  state: "not initialized",
                  message: "No orchestrator state found",
                }),
              },
            ],
          };
        }

        const pending = listPendingDecisions(rootDir);
        const decisions = pending.map((d) => ({
          id: d.id,
          kind: d.kind,
          summary: d.summary,
          detail: formatDecisionDetail(d),
          createdAt: d.createdAt,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ...ctx, pendingDecisions: decisions },
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
    "telesis_orchestrator_run",
    "Advance the orchestrator state machine until it reaches a decision point or returns to idle. LLM-powered — may use tokens for triage and TDD assessment.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      const bus = createBus();
      try {
        const rootDir = resolveRoot(projectRoot);
        let ctx = loadContext(rootDir) ?? createContext();

        const sessionId = randomUUID();
        const client = createClient(rootDir, sessionId, "orchestrator");
        const deps = buildRunnerDeps(rootDir, bus, client);

        const transitions: string[] = [];
        const MAX_STEPS = 50;

        for (let step = 0; step < MAX_STEPS; step++) {
          const result = await advance(ctx, deps);
          ctx = result.context;
          transitions.push(ctx.state);

          if (result.error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      state: ctx.state,
                      error: result.error,
                      transitions,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          if (result.waiting) {
            const pending = listPendingDecisions(rootDir);

            // Push decision notification via logging message
            for (const d of pending) {
              try {
                await server.sendLoggingMessage({
                  level: "info",
                  data: `Decision needed: ${d.summary} — approve: telesis orchestrator approve ${d.id.slice(0, 8)}`,
                });
              } catch {
                // sendLoggingMessage may fail if no client is connected
              }
            }

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      state: ctx.state,
                      waiting: true,
                      transitions,
                      pendingDecisions: pending.map((d) => ({
                        id: d.id,
                        kind: d.kind,
                        summary: d.summary,
                      })),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          if (ctx.state === "idle") {
            break;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  state: ctx.state,
                  transitions,
                  message:
                    ctx.state === "idle"
                      ? "Cycle complete"
                      : "Max steps reached",
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
      } finally {
        bus.dispose();
      }
    },
  );

  server.tool(
    "telesis_orchestrator_approve",
    "Approve a pending orchestrator decision. For triage decisions, accepts optional milestone metadata.",
    {
      decisionId: z.string().describe("Decision ID or prefix (8+ characters)"),
      items: z
        .string()
        .optional()
        .describe(
          "Comma-separated work item IDs to include (triage decisions only)",
        ),
      milestoneName: z
        .string()
        .optional()
        .describe("Milestone name (triage decisions only)"),
      milestoneId: z
        .string()
        .optional()
        .describe("Milestone version (triage decisions only)"),
      goal: z
        .string()
        .optional()
        .describe("Milestone goal (triage decisions only)"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({
      decisionId,
      items,
      milestoneName,
      milestoneId,
      goal,
      projectRoot,
    }) => {
      try {
        const rootDir = resolveRoot(projectRoot);

        // Resolve the decision first — if this throws, no context mutation happens
        const resolved = resolveDecision(rootDir, decisionId, "approved");

        // Then save triage metadata if provided
        const hasTriageMetadata = items || milestoneName || milestoneId || goal;
        if (hasTriageMetadata) {
          const ctx = loadContext(rootDir);
          if (!ctx) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Decision approved but orchestrator state not found — triage metadata was not saved.",
                },
              ],
              isError: true,
            };
          }
          const updated: OrchestratorContext = {
            ...ctx,
            ...(items && {
              workItemIds: items
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            }),
            ...(milestoneName && { milestoneName }),
            ...(milestoneId && { milestoneId }),
            ...(goal && { milestoneGoal: goal }),
            updatedAt: new Date().toISOString(),
          };
          saveContext(rootDir, updated);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  approved: true,
                  id: resolved.id,
                  kind: resolved.kind,
                  summary: resolved.summary,
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
    "telesis_orchestrator_reject",
    "Reject a pending orchestrator decision with a reason",
    {
      decisionId: z.string().describe("Decision ID or prefix (8+ characters)"),
      reason: z.string().describe("Reason for rejection"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ decisionId, reason, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const resolved = resolveDecision(
          rootDir,
          decisionId,
          "rejected",
          reason,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  rejected: true,
                  id: resolved.id,
                  kind: resolved.kind,
                  reason,
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
    "telesis_orchestrator_preflight",
    "Run preflight checks: milestone entry, review convergence, quality gates, pending decisions. Used by Claude Code hooks to gate git commit.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const result = runPreflight(rootDir);
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
