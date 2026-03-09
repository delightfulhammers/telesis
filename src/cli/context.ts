import { writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { generate } from "../context/context.js";
import { projectRoot } from "./project-root.js";

let contextCounter = 0;

export const contextCommand = new Command("context")
  .description("Regenerate CLAUDE.md from current document state")
  .action(() => {
    const rootDir = projectRoot();
    const output = generate(rootDir);

    const claudePath = join(rootDir, "CLAUDE.md");
    const tmpPath = join(
      rootDir,
      `.CLAUDE-${process.pid}-${++contextCounter}.md`,
    );

    try {
      writeFileSync(tmpPath, output, { mode: 0o666 });
      renameSync(tmpPath, claudePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // cleanup best-effort
      }
      throw err;
    }

    console.log("CLAUDE.md regenerated successfully.");
  });
