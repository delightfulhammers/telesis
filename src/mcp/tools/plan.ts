import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { listPlans, loadPlan, updatePlan } from "../../plan/store.js";
import type { PlanStatus } from "../../plan/types.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_plan_list",
    "List task plans. By default shows only non-completed plans.",
    {
      all: z
        .boolean()
        .optional()
        .describe("Show all statuses (default: non-completed only)"),
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
                "draft",
                "approved",
                "executing",
                "failed",
                "escalated",
                "awaiting_gate",
              ] as PlanStatus[],
            };
        const plans = listPlans(rootDir, filter);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(plans, null, 2),
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
    "telesis_plan_show",
    "Show plan detail with task graph by ID or prefix",
    {
      id: z.string().describe("Plan ID or prefix"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ id, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const plan = loadPlan(rootDir, id);

        if (!plan) {
          return {
            content: [
              { type: "text" as const, text: `No plan matching "${id}"` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(plan, null, 2),
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
    "telesis_plan_approve",
    "Approve a draft plan (transition draft → approved)",
    {
      id: z.string().describe("Plan ID or prefix"),
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ id, projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const plan = loadPlan(rootDir, id);

        if (!plan) {
          return {
            content: [
              { type: "text" as const, text: `No plan matching "${id}"` },
            ],
            isError: true,
          };
        }

        if (plan.status !== "draft") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Plan ${plan.id.slice(0, 8)} has status "${plan.status}", expected "draft"`,
              },
            ],
            isError: true,
          };
        }

        const approved = {
          ...plan,
          status: "approved" as const,
          approvedAt: new Date().toISOString(),
        };
        updatePlan(rootDir, approved);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(approved, null, 2),
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
