import { Command } from "commander";
import { create } from "../adr/adr.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

const adrNewCommand = new Command("new")
  .description("Create a new ADR from template")
  .argument("<slug>", "ADR slug (lowercase with hyphens)")
  .action(
    handleAction((slug: string) => {
      const rootDir = projectRoot();
      const path = create(rootDir, slug);
      console.log(`Created ${path}`);
    }),
  );

export const adrCommand = new Command("adr")
  .description("Manage architectural decision records")
  .addCommand(adrNewCommand);
