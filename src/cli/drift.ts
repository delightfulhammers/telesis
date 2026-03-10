import { Command } from "commander";
import { resolve } from "node:path";
import { allChecks } from "../drift/checks/index.js";
import { runChecks } from "../drift/runner.js";
import { formatDriftReport } from "../drift/format.js";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";

export const driftCommand = new Command("drift")
  .description("Detect drift between spec documents and implementation")
  .option("--check <name...>", "Run only the named check(s)")
  .option("--json", "Output report as JSON")
  .action(
    handleAction(async (opts: { check?: string[]; json?: boolean }) => {
      const rootDir = resolve(projectRoot());

      if (opts.check) {
        const validNames = new Set(allChecks.map((c) => c.name));
        const unknown = opts.check.filter((n) => !validNames.has(n));
        if (unknown.length > 0) {
          const available = [...validNames].sort().join(", ");
          throw new Error(
            `Unknown check(s): ${unknown.join(", ")}. Available: ${available}`,
          );
        }
      }

      const report = runChecks(allChecks, rootDir, opts.check);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDriftReport(report));
      }

      if (!report.passed) {
        process.exit(1);
      }
    }),
  );
