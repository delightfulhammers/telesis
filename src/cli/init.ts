import { Command } from "commander";
import { scaffold } from "../scaffold/scaffold.js";
import type { Config } from "../config/config.js";

export const initCommand = new Command("init")
  .description("Initialize a new Telesis project")
  .requiredOption("-n, --name <name>", "project name")
  .option("-o, --owner <owner>", "project owner", "")
  .option("-l, --language <language>", "primary programming language", "")
  .option("-r, --repo <repo>", "repository URL", "")
  .action((opts) => {
    const cfg: Config = {
      project: {
        name: opts.name,
        owner: opts.owner,
        language: opts.language,
        status: "",
        repo: opts.repo,
      },
    };

    scaffold(".", cfg);

    console.log(`Telesis initialized for ${opts.name}.`);
    console.log("Next steps:");
    console.log("  1. Edit docs/VISION.md with your project vision");
    console.log("  2. Edit docs/PRD.md with your requirements");
    console.log("  3. Run `telesis context` to regenerate CLAUDE.md");
  });
