import { Command } from "commander";
import { resolve } from "node:path";
import { allChecks } from "../drift/checks/index.js";
import { runChecks } from "../drift/runner.js";
import { formatDriftReport } from "../drift/format.js";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";
import { extractPRContext } from "../github/environment.js";
import { driftToComment } from "../github/adapter.js";
import { DRIFT_COMMENT_MARKER } from "../github/format.js";
import {
  findCommentByMarker,
  updatePRComment,
  postPRComment,
} from "../github/client.js";

export const driftCommand = new Command("drift")
  .description("Detect drift between spec documents and implementation")
  .option("--check <name...>", "Run only the named check(s)")
  .option("--json", "Output report as JSON")
  .option("--github-pr", "Post drift results as a PR comment")
  .action(
    handleAction(
      async (opts: {
        check?: string[];
        json?: boolean;
        githubPr?: boolean;
      }) => {
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

        if (opts.githubPr) {
          await postDriftToGitHubSafe(report);
        }

        if (!report.passed) {
          process.exitCode = 1;
        }
      },
    ),
  );

const postDriftToGitHubSafe = async (
  report: Parameters<typeof driftToComment>[0],
): Promise<void> => {
  try {
    const ctx = extractPRContext();
    if (!ctx) {
      console.error(
        "Warning: --github-pr specified but no PR context detected. Skipping.",
      );
      return;
    }

    const body = driftToComment(report);
    const existingId = await findCommentByMarker(ctx, DRIFT_COMMENT_MARKER);

    if (existingId) {
      await updatePRComment(ctx, existingId, body);
      console.error(`Updated drift comment on PR #${ctx.pullNumber}`);
    } else {
      await postPRComment(ctx, body);
      console.error(`Posted drift comment to PR #${ctx.pullNumber}`);
    }
  } catch (err) {
    console.error(
      "Warning: could not post drift report to GitHub:",
      err instanceof Error ? err.message : err,
    );
  }
};
