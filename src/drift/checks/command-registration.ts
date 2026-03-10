import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck } from "../types.js";

const extractPrdCommands = (prdContent: string): readonly string[] => {
  const pattern = /^###\s+`telesis\s+(\S+)/gm;
  const commands: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prdContent)) !== null) {
    commands.push(match[1].replace(/`$/, ""));
  }
  return commands.sort();
};

const extractRegisteredCommands = (indexContent: string): readonly string[] => {
  const pattern = /\.addCommand\(\s*(\w+)/g;
  const commands: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(indexContent)) !== null) {
    // Extract the command name from the variable name (e.g., initCommand → init)
    const varName = match[1];
    const cmdName = varName.replace(/Command$/, "");
    commands.push(cmdName);
  }
  return commands.sort();
};

export const commandRegistrationCheck: DriftCheck = {
  name: "command-registration",
  description: "PRD commands match registered CLI commands",
  requiresModel: false,
  run: (rootDir) => {
    const prdContent = readFileSync(join(rootDir, "docs", "PRD.md"), "utf-8");
    const indexContent = readFileSync(
      join(rootDir, "src", "index.ts"),
      "utf-8",
    );

    const prdCommands = extractPrdCommands(prdContent);
    const registeredCommands = extractRegisteredCommands(indexContent);

    const inPrdNotRegistered = prdCommands.filter(
      (cmd) => !registeredCommands.includes(cmd),
    );
    const registeredNotInPrd = registeredCommands.filter(
      (cmd) => !prdCommands.includes(cmd),
    );

    const details: string[] = [
      ...inPrdNotRegistered.map((cmd) => `In PRD but not registered: ${cmd}`),
      ...registeredNotInPrd.map((cmd) => `Registered but not in PRD: ${cmd}`),
    ];

    const passed = details.length === 0;

    return {
      check: "command-registration",
      passed,
      message: passed
        ? "PRD commands and registered commands match"
        : `${details.length} command mismatch(es)`,
      severity: "warning",
      details,
    };
  },
};
