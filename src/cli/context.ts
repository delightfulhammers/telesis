import {
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
  constants,
} from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { generate } from "../context/context.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

let contextCounter = 0;

export const contextCommand = new Command("context")
  .description("Regenerate CLAUDE.md from current document state")
  .action(
    handleAction(() => {
      const rootDir = projectRoot();
      const output = generate(rootDir);

      const claudePath = join(rootDir, "CLAUDE.md");
      const tmpPath = join(
        rootDir,
        `.CLAUDE-${process.pid}-${++contextCounter}.md`,
      );

      const fd = openSync(
        tmpPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o666,
      );

      try {
        writeFileSync(fd, output);
      } catch (err) {
        closeSync(fd);
        try {
          unlinkSync(tmpPath);
        } catch {
          /* cleanup best-effort */
        }
        throw err;
      }

      closeSync(fd);

      try {
        renameSync(tmpPath, claudePath);
      } catch (err) {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* cleanup best-effort */
        }
        throw err;
      }

      console.log("CLAUDE.md regenerated successfully.");
    }),
  );
