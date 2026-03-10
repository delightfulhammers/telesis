import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

const extractPrdCommands = (prdContent: string): readonly string[] => {
  const pattern = /^###\s+`telesis\s+([^`\s]+)/gm;
  const commands: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prdContent)) !== null) {
    commands.push(match[1]);
  }
  return commands.sort();
};

/**
 * Extracts command names from `.addCommand(fooCommand)` calls in index.ts.
 * Assumes the convention: variable name is `<name>Command` (e.g., `initCommand`
 * → `init`). If the variable doesn't follow this convention, the full variable
 * name is used as the command name.
 */
const extractRegisteredCommands = (indexContent: string): readonly string[] => {
  const pattern = /\.addCommand\(\s*(\w+)/g;
  const commands: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(indexContent)) !== null) {
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
  run: (rootDir): DriftFinding => {
    const prdPath = join(rootDir, "docs", "PRD.md");
    const indexPath = join(rootDir, "src", "index.ts");

    const missing = [prdPath, indexPath].filter((p) => !existsSync(p));
    if (missing.length > 0) {
      return {
        check: "command-registration",
        passed: false,
        message: "Required file(s) missing for command registration check",
        severity: "warning",
        details: missing.map((p) => `Missing: ${relative(rootDir, p)}`),
      };
    }

    const prdContent = readFileSync(prdPath, "utf-8");
    const indexContent = readFileSync(indexPath, "utf-8");

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
