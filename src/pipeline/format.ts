import type { RunResult } from "./types.js";

/** Format a pipeline run result for CLI display */
export const formatRunResult = (result: RunResult): string => {
  const lines: string[] = [];
  const idShort = result.workItemId.slice(0, 8);
  const duration = Math.floor(result.durationMs / 1000);

  if (result.stage === "completed") {
    lines.push(`Pipeline completed for work item ${idShort} (${duration}s)`);

    if (result.commitResult) {
      lines.push(
        `  Commit: ${result.commitResult.sha.slice(0, 8)} (${result.commitResult.filesChanged} files)`,
      );
    }

    if (result.pushResult) {
      lines.push(
        `  Pushed: ${result.pushResult.branch} → ${result.pushResult.remote}`,
      );
    }

    if (result.prUrl) {
      lines.push(`  PR: ${result.prUrl}`);
    }

    if (result.reviewSummary?.ran) {
      const rs = result.reviewSummary;
      const status = rs.passed ? "passed" : "blocked";
      lines.push(
        `  Review: ${status} (${rs.totalFindings} findings, ${rs.blockingFindings} blocking, threshold: ${rs.threshold})`,
      );
    }
  } else if (result.stage === "failed") {
    lines.push(`Pipeline failed for work item ${idShort} (${duration}s)`);
    if (result.error) {
      lines.push(`  Error: ${result.error}`);
    }
    if (result.reviewSummary?.ran) {
      const rs = result.reviewSummary;
      lines.push(
        `  Review: ${rs.totalFindings} findings, ${rs.blockingFindings} blocking (threshold: ${rs.threshold})`,
      );
    }
  } else if (result.stage === "review_failed") {
    lines.push(
      `Pipeline blocked by review for work item ${idShort} (${duration}s)`,
    );
    if (result.reviewSummary?.ran) {
      const rs = result.reviewSummary;
      lines.push(
        `  Review: ${rs.totalFindings} findings, ${rs.blockingFindings} blocking (threshold: ${rs.threshold})`,
      );
    }
    if (result.commitResult) {
      lines.push(
        `  Commit: ${result.commitResult.sha.slice(0, 8)} (${result.commitResult.filesChanged} files)`,
      );
    }
  } else if (result.stage === "awaiting_gate") {
    lines.push(
      `Pipeline paused at milestone gate for work item ${idShort} (${duration}s)`,
    );
    lines.push(
      `  Run \`telesis plan gate-approve ${result.planId.slice(0, 8)}\` to continue.`,
    );
  } else {
    lines.push(
      `Pipeline stopped at stage "${result.stage}" for work item ${idShort}`,
    );
    if (result.error) {
      lines.push(`  Error: ${result.error}`);
    }
  }

  return lines.join("\n");
};
