#!/usr/bin/env bun
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

const program = new Command("telesis")
  .description("Development intelligence platform")
  .version("0.3.0")
  .addCommand(initCommand)
  .addCommand(contextCommand)
  .addCommand(adrCommand)
  .addCommand(tddCommand)
  .addCommand(statusCommand)
  .addCommand(evalCommand)
  .addCommand(driftCommand)
  .addCommand(noteCommand)
  .addCommand(reviewCommand)
  .addCommand(milestoneCommand);

program.parse();
