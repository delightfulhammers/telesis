import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Command } from "commander";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";
import { createModelClient, createSdk } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { resolveDiff } from "../agent/review/diff.js";
import { assembleReviewContext } from "../agent/review/context.js";
import { reviewDiff } from "../agent/review/agent.js";
import {
  saveReviewSession,
  loadReviewSession,
  listReviewSessions,
} from "../agent/review/store.js";
import {
  formatReviewReport,
  formatSessionList,
  filterBySeverity,
} from "../agent/review/format.js";
import { SEVERITIES, type Severity } from "../agent/review/types.js";
import type { ReviewSession } from "../agent/review/types.js";

export const reviewCommand = new Command("review")
  .description("Review code changes against project conventions")
  .option("--all", "Review working + staged changes (default: staged only)")
  .option(
    "--ref <ref>",
    "Review diff against ref (e.g., main, main...HEAD, abc..def)",
  )
  .option("--json", "Output as JSON")
  .option(
    "--min-severity <level>",
    "Minimum severity to display (critical, high, medium, low)",
  )
  .option("--list", "List past review sessions")
  .option("--show <id>", "Show findings from a past session")
  .action(
    handleAction(
      async (opts: {
        all?: boolean;
        ref?: string;
        json?: boolean;
        minSeverity?: string;
        list?: boolean;
        show?: string;
      }) => {
        const rootDir = resolve(projectRoot());

        // Validate shared options early
        if (
          opts.minSeverity &&
          !(SEVERITIES as readonly string[]).includes(opts.minSeverity)
        ) {
          throw new Error(
            `Invalid severity: ${opts.minSeverity}. Valid: ${SEVERITIES.join(", ")}`,
          );
        }

        // List mode
        if (opts.list) {
          const sessions = listReviewSessions(rootDir);
          if (opts.json) {
            console.log(JSON.stringify(sessions, null, 2));
          } else {
            console.log(formatSessionList(sessions));
          }
          return;
        }

        // Show mode
        if (opts.show) {
          const { session, findings } = loadReviewSession(rootDir, opts.show);
          const filtered = opts.minSeverity
            ? filterBySeverity(findings, opts.minSeverity as Severity)
            : findings;
          if (opts.json) {
            console.log(
              JSON.stringify({ session, findings: filtered }, null, 2),
            );
          } else {
            console.log(formatReviewReport(session, filtered));
          }
          return;
        }

        // Review mode
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error(
            "ANTHROPIC_API_KEY environment variable is not set. " +
              "Set it to your Anthropic API key before running telesis review.",
          );
        }

        // Resolve diff
        const resolved = resolveDiff(rootDir, opts.ref, opts.all);
        if (resolved.diff.length === 0) {
          console.log(`No changes to review (${resolved.ref}).`);
          return;
        }

        // Assemble context
        const context = assembleReviewContext(rootDir);

        // Call model
        const sessionId = randomUUID();
        const telemetry = createTelemetryLogger(rootDir);
        const sdk = createSdk();
        const client = createModelClient({
          sdk,
          telemetry,
          sessionId,
          component: "review",
        });

        const model = "claude-sonnet-4-6";
        const result = await reviewDiff(
          client,
          resolved.diff,
          resolved.files,
          context,
          sessionId,
          model,
        );

        // Build session record
        const session: ReviewSession = {
          id: sessionId,
          timestamp: new Date().toISOString(),
          ref: resolved.ref,
          files: resolved.files,
          findingCount: result.findings.length,
          model: result.model,
          durationMs: result.durationMs,
          tokenUsage: result.tokenUsage,
        };

        // Save (fail-soft)
        try {
          saveReviewSession(rootDir, session, result.findings);
        } catch (err) {
          console.error(
            "Warning: could not save review session:",
            err instanceof Error ? err.message : err,
          );
        }

        // Filter and display
        const filtered = opts.minSeverity
          ? filterBySeverity(result.findings, opts.minSeverity as Severity)
          : result.findings;

        if (opts.json) {
          console.log(JSON.stringify({ session, findings: filtered }, null, 2));
        } else {
          console.log(formatReviewReport(session, filtered));
        }

        // Exit 1 if any critical or high findings (based on full results, not display filter)
        const hasCriticalOrHigh = result.findings.some(
          (f) => f.severity === "critical" || f.severity === "high",
        );
        if (hasCriticalOrHigh) {
          process.exitCode = 1;
        }
      },
    ),
  );
