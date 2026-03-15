import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { checkMilestone } from "../../milestones/check.js";
import { completeMilestone } from "../../milestones/complete.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_milestone_check",
    "Validate the active milestone is ready for completion. Returns automated and manual check results.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const report = checkMilestone(rootDir);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(report, null, 2),
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
    "telesis_milestone_complete",
    "Mark the active milestone as complete. Runs validation, then updates MILESTONES.md, bumps version in package.json, updates TDD statuses, and regenerates CLAUDE.md. Does NOT perform git operations (commit/tag/push) — those must be done manually or via separate commands.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
    },
    async ({ projectRoot }) => {
      try {
        const rootDir = resolveRoot(projectRoot);

        const report = checkMilestone(rootDir);
        if (!report.passed) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      "Milestone check failed. Fix the issues before completing.",
                    report,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const result = completeMilestone(rootDir);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  milestone: result.milestone,
                  version: result.version,
                  steps: result.steps,
                  modifiedFiles: result.modifiedFiles,
                  nextSteps: [
                    `git add ${result.modifiedFiles.join(" ")}`,
                    `git commit -m "chore: complete ${result.milestone}"`,
                    `git tag v${result.version}`,
                    "git push && git push --tags",
                  ],
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
