import { Command } from "commander";
import { handleAction } from "./handle-action.js";
import { checkForUpdate, performUpdate } from "../update/update.js";

export const updateCommand = new Command("update")
  .description("Check for and install Telesis updates")
  .option("--check", "Check for updates without installing")
  .action(
    handleAction(async (opts: { check?: boolean }) => {
      if (opts.check) {
        const result = await checkForUpdate();
        console.log(`Current: v${result.currentVersion}`);
        console.log(`Latest:  v${result.latestVersion}`);
        if (result.updateAvailable) {
          console.log(`\nUpdate available! Run \`telesis update\` to install.`);
        } else {
          console.log(`\nAlready up to date.`);
        }
        return;
      }

      console.log("Checking for updates...");
      const result = await performUpdate();

      if (!result.updateAvailable) {
        console.log(`Already up to date (v${result.currentVersion}).`);
        return;
      }

      if (result.updated) {
        console.log(
          `Updated: v${result.currentVersion} → v${result.latestVersion}`,
        );
        console.log("Restart telesis to use the new version.");
      } else {
        console.error(`Update failed: ${result.error ?? "unknown error"}`);
        process.exitCode = 1;
      }
    }),
  );
