import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { useTempDir } from "../../test-utils.js";
import { acpxImportCheck } from "./acpx-import.js";

const makeTempDir = useTempDir("acpx-import");

const setupSrc = (root: string, files: Record<string, string>): void => {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, "src", path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
};

describe("acpxImportCheck", () => {
  it("passes when acpx command is only in acpx-adapter.ts", () => {
    const root = makeTempDir();
    setupSrc(root, {
      "dispatch/acpx-adapter.ts":
        'const acpxPath = options.acpxPath ?? "acpx";',
      "dispatch/dispatcher.ts":
        'import { createAcpxAdapter } from "./acpx-adapter.js";',
      "cli/dispatch.ts":
        'import { dispatch } from "../dispatch/dispatcher.js";',
    });

    const result = acpxImportCheck.run(root);
    expect(result.passed).toBe(true);
  });

  it("fails when acpx command is constructed outside the allowed file", () => {
    const root = makeTempDir();
    setupSrc(root, {
      "dispatch/acpx-adapter.ts": 'const acpxPath = "acpx";',
      "dispatch/dispatcher.ts": 'const cmd = ["acpx", agent, "prompt"];',
    });

    const result = acpxImportCheck.run(root);
    expect(result.passed).toBe(false);
    expect(result.details.length).toBe(1);
    expect(result.details[0]).toContain("dispatch/dispatcher.ts");
  });

  it("ignores test files", () => {
    const root = makeTempDir();
    setupSrc(root, {
      "dispatch/acpx-adapter.ts": 'const acpxPath = "acpx";',
      "dispatch/acpx-adapter.test.ts":
        'const adapter = createAcpxAdapter({ acpxPath: "acpx" });',
    });

    const result = acpxImportCheck.run(root);
    expect(result.passed).toBe(true);
  });

  it("passes when no files reference acpx", () => {
    const root = makeTempDir();
    setupSrc(root, {
      "dispatch/dispatcher.ts": 'import { something } from "./adapter.js";',
    });

    const result = acpxImportCheck.run(root);
    expect(result.passed).toBe(true);
  });
});
