import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { sdkImportCheck } from "./sdk-import.js";

describe("sdk-import-containment", () => {
  const makeTempDir = useTempDir("sdk-import");

  const setupProject = (files: Record<string, string>): string => {
    const dir = makeTempDir();
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(dir, "src", path);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
    return dir;
  };

  it("passes when SDK is only imported in the allowed file", () => {
    const dir = setupProject({
      "agent/model/client.ts": 'import Anthropic from "@anthropic-ai/sdk";',
      "config/config.ts": 'import { readFileSync } from "node:fs";',
    });

    const result = sdkImportCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(0);
  });

  it("fails when SDK is imported in a disallowed file", () => {
    const dir = setupProject({
      "agent/model/client.ts": 'import Anthropic from "@anthropic-ai/sdk";',
      "config/config.ts": 'import { something } from "@anthropic-ai/sdk";',
    });

    const result = sdkImportCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain("config/config.ts");
  });

  it("passes when no files import the SDK", () => {
    const dir = setupProject({
      "index.ts": "console.log('hello');",
    });

    const result = sdkImportCheck.run(dir);
    expect(result.passed).toBe(true);
  });
});
