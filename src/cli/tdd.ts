import { Command } from "commander";
import { create } from "../tdd/tdd.js";
import { projectRoot } from "./project-root.js";

const tddNewCommand = new Command("new")
  .description("Create a new TDD from template")
  .argument("<slug>", "TDD slug (lowercase with hyphens)")
  .action((slug: string) => {
    const rootDir = projectRoot();
    const path = create(rootDir, slug);
    console.log(`Created ${path}`);
  });

export const tddCommand = new Command("tdd")
  .description("Manage technical design documents")
  .addCommand(tddNewCommand);
