import { Command } from "commander";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import { checkUpgrade, applyUpgrade } from "../scaffold/upgrade.js";

export const upgradeCommand = new Command("upgrade")
  .description("Add missing scaffold artifacts (hooks, skills, MCP config)")
  .option("--check", "Report what would be added without making changes")
  .action(
    handleAction((opts: { check?: boolean }) => {
      const rootDir = projectRoot();

      if (opts.check) {
        const result = checkUpgrade(rootDir);
        if (result.added.length === 0) {
          console.log("Project scaffold is up to date.");
          return;
        }

        console.log(`${result.added.length} artifact(s) would be added:\n`);
        for (const item of result.added) {
          console.log(`  + ${item.path} — ${item.description}`);
        }
        console.log("\nRun `telesis upgrade` to apply.");
        return;
      }

      const result = applyUpgrade(rootDir);

      if (result.added.length === 0 && result.failed.length === 0) {
        console.log("Project scaffold is up to date.");
        return;
      }

      if (result.added.length > 0) {
        console.log(`Added ${result.added.length} artifact(s):\n`);
        for (const item of result.added) {
          console.log(`  + ${item.path} — ${item.description}`);
        }
      }

      if (result.failed.length > 0) {
        console.log(`\n${result.failed.length} artifact(s) failed:\n`);
        for (const f of result.failed) {
          console.log(`  ✗ ${f.item.path} — ${f.error}`);
        }
        process.exitCode = 1;
      }

      if (result.alreadyPresent.length > 0) {
        console.log(
          `\n${result.alreadyPresent.length} artifact(s) already present (not modified).`,
        );
      }
    }),
  );
