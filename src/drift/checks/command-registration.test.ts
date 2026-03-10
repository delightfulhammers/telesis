import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { commandRegistrationCheck } from "./command-registration.js";

describe("command-registration", () => {
  const makeTempDir = useTempDir("cmd-reg");

  const setup = (prd: string, index: string): string => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "docs", "PRD.md"), prd);
    writeFileSync(join(dir, "src", "index.ts"), index);
    return dir;
  };

  it("passes when PRD commands match registered commands", () => {
    const prd = "### `telesis init`\n### `telesis status`\n";
    const index = `.addCommand(initCommand)\n.addCommand(statusCommand)\n`;
    const dir = setup(prd, index);

    const result = commandRegistrationCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("detects commands in PRD but not registered", () => {
    const prd = "### `telesis init`\n### `telesis deploy`\n";
    const index = `.addCommand(initCommand)\n`;
    const dir = setup(prd, index);

    const result = commandRegistrationCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details).toContain("In PRD but not registered: deploy");
  });

  it("detects registered commands not in PRD", () => {
    const prd = "### `telesis init`\n";
    const index = `.addCommand(initCommand)\n.addCommand(secretCommand)\n`;
    const dir = setup(prd, index);

    const result = commandRegistrationCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details).toContain("Registered but not in PRD: secret");
  });

  it("handles empty PRD and index", () => {
    const dir = setup("# No commands\n", "const x = 1;\n");

    const result = commandRegistrationCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("returns a failed finding with relative paths when PRD.md is missing", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), ".addCommand(initCommand)\n");

    const result = commandRegistrationCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("missing");
    expect(result.details[0]).toBe("Missing: docs/PRD.md");
  });
});
