#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { initCommand } from "./cli/init.js";
import { contextCommand } from "./cli/context.js";
import { adrCommand } from "./cli/adr.js";
import { tddCommand } from "./cli/tdd.js";
import { statusCommand } from "./cli/status.js";
import { evalCommand } from "./cli/eval.js";
import { driftCommand } from "./cli/drift.js";
import { noteCommand } from "./cli/note.js";
import { reviewCommand } from "./cli/review.js";
import { milestoneCommand } from "./cli/milestone.js";
import { journalCommand } from "./cli/journal.js";
import { daemonCommand } from "./cli/daemon.js";
import { dispatchCommand } from "./cli/dispatch.js";
import { intakeCommand } from "./cli/intake.js";
import { planCommand } from "./cli/plan.js";

const readVersion = (): string => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(dir, "..", "package.json"), "utf-8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
};

const program = new Command("telesis")
  .description("Development intelligence platform")
  .version(readVersion())
  .enablePositionalOptions()
  .addCommand(initCommand)
  .addCommand(contextCommand)
  .addCommand(adrCommand)
  .addCommand(tddCommand)
  .addCommand(statusCommand)
  .addCommand(evalCommand)
  .addCommand(driftCommand)
  .addCommand(noteCommand)
  .addCommand(reviewCommand)
  .addCommand(milestoneCommand)
  .addCommand(journalCommand)
  .addCommand(daemonCommand)
  .addCommand(dispatchCommand)
  .addCommand(intakeCommand)
  .addCommand(planCommand);

program.parse();
