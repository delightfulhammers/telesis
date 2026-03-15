import { Command } from "commander";
import { generateAndWrite } from "../context/context.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

export const contextCommand = new Command("context")
  .description("Regenerate CLAUDE.md from current document state")
  .action(
    handleAction(() => {
      const rootDir = projectRoot();
      generateAndWrite(rootDir);
      console.log("CLAUDE.md regenerated successfully.");
    }),
  );
