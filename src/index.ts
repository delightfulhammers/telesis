#!/usr/bin/env bun
import { Command } from "commander";
import { initCommand } from "./cli/init.js";
import { contextCommand } from "./cli/context.js";
import { adrCommand } from "./cli/adr.js";
import { tddCommand } from "./cli/tdd.js";
import { statusCommand } from "./cli/status.js";

const program = new Command("telesis")
  .description("Development intelligence platform")
  .version("0.2.0")
  .addCommand(initCommand)
  .addCommand(contextCommand)
  .addCommand(adrCommand)
  .addCommand(tddCommand)
  .addCommand(statusCommand);

program.parse();
