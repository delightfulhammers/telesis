import { Command } from "commander";
import { resolve } from "node:path";
import { checkMilestone } from "../milestones/check.js";
import { completeMilestone } from "../milestones/complete.js";
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
  .action(
    handleAction(async () => {
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
      console.log("Remaining manual steps:");
      console.log("  - Update docs/PRD.md with new command documentation");
      console.log("  - Update docs/ARCHITECTURE.md with new files");
      console.log(`  - Commit, push, and tag (git tag v${result.version})`);
    }),
  );

export const milestoneCommand = new Command("milestone")
  .description("Milestone validation and completion")
  .addCommand(checkCommand)
  .addCommand(completeCommand);
