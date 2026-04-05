import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RootResolver } from "../root-resolver.js";
import { allChecks } from "../../drift/checks/index.js";
import { runChecks } from "../../drift/runner.js";
import { buildContainmentChecks } from "../../drift/containment.js";
import { load, loadRawConfig, parseDriftConfig } from "../../config/config.js";

export const register = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  server.tool(
    "telesis_drift",
    "Run drift detection checks between spec documents and implementation. Returns pass/fail for each check with details.",
    {
      projectRoot: z
        .string()
        .optional()
        .describe("Override project root directory"),
      checks: z
        .array(z.string())
        .optional()
        .describe("Run only the named check(s). Omit to run all."),
    },
    async ({ projectRoot, checks: filter }) => {
      try {
        const rootDir = resolveRoot(projectRoot);
        const cfg = load(rootDir);
        const rawConfig = loadRawConfig(rootDir);
        const driftConfig = parseDriftConfig(rawConfig);
        const configChecks = buildContainmentChecks(
          driftConfig.containment ?? [],
        );
        const allDriftChecks = [...allChecks, ...configChecks];

        if (filter) {
          const validNames = new Set(allDriftChecks.map((c) => c.name));
          const unknown = filter.filter((n) => !validNames.has(n));
          if (unknown.length > 0) {
            const available = [...validNames].sort().join(", ");
            throw new Error(
              `Unknown check(s): ${unknown.join(", ")}. Available: ${available}`,
            );
          }
        }

        const report = runChecks(
          allDriftChecks,
          rootDir,
          filter,
          cfg.project.languages,
        );

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
};
