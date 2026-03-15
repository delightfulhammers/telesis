import { Command } from "commander";
import { resolve } from "node:path";
import { checkMilestone } from "../milestones/check.js";
import { completeMilestone } from "../milestones/complete.js";
import {
  finalizeMilestone,
  defaultFinalizeDeps,
} from "../milestones/finalize.js";
import { formatCheckReport } from "../milestones/format.js";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";

const checkCommand = new Command("check")
  .description("Validate the active milestone is ready for completion")
  .action(
    handleAction(async () => {
      const rootDir = resolve(projectRoot());
      const report = checkMilestone(rootDir);
      console.log(formatCheckReport(report));

      if (!report.passed) {
        process.exitCode = 1;
      }
    }),
  );

const completeCommand = new Command("complete")
  .description("Mark the active milestone as complete after validation passes")
  .option("--no-tag", "Skip creating a git tag")
  .option("--no-push", "Skip pushing to remote")
  .action(
    handleAction(async (opts: { tag: boolean; push: boolean }) => {
      const rootDir = resolve(projectRoot());

      const report = checkMilestone(rootDir);
      console.log(formatCheckReport(report));

      if (!report.passed) {
        console.error(
          "\nMilestone check failed. Fix the issues above before completing.",
        );
        process.exitCode = 1;
        return;
      }

      console.log("");
      const result = completeMilestone(rootDir);

      console.log(`Completed: ${result.milestone} (v${result.version})`);
      console.log("");
      for (const step of result.steps) {
        const indicator = step.passed ? "✓" : "✗";
        console.log(`  ${indicator} ${step.name}: ${step.message}`);
      }

      console.log("");
      const finalizeResult = finalizeMilestone(
        rootDir,
        result,
        { tag: opts.tag, push: opts.push },
        defaultFinalizeDeps,
      );

      for (const step of finalizeResult.steps) {
        const indicator = step.passed ? "✓" : "✗";
        console.log(`  ${indicator} ${step.name}: ${step.message}`);
      }

      if (finalizeResult.steps.some((s) => !s.passed)) {
        process.exitCode = 1;
      }

      if (finalizeResult.reminders.length > 0) {
        console.log("");
        console.log("Reminders:");
        for (const reminder of finalizeResult.reminders) {
          console.log(`  - ${reminder}`);
        }
      }
    }),
  );

export const milestoneCommand = new Command("milestone")
  .description("Milestone validation and completion")
  .addCommand(checkCommand)
  .addCommand(completeCommand);
