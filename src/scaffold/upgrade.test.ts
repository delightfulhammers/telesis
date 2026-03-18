import { describe, it, expect } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { checkUpgrade, applyUpgrade } from "./upgrade.js";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("upgrade-test");

const setupInitializedProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test",
      language: "Go",
      languages: ["Go"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
};

describe("checkUpgrade", () => {
  it("reports missing artifacts on a minimal initialized project", () => {
    const dir = makeTempDir();
    setupInitializedProject(dir);

    const result = checkUpgrade(dir);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.added.some((a) => a.path === ".mcp.json")).toBe(true);
    expect(result.added.some((a) => a.path.includes("settings.json"))).toBe(
      true,
    );
  });

  it("reports nothing to add after applying (except dev-mode failures)", () => {
    const dir = makeTempDir();
    setupInitializedProject(dir);

    // Apply first
    const applyResult = applyUpgrade(dir);

    // Check should show nothing to add for successfully created artifacts
    const result = checkUpgrade(dir);
    // Filter out artifacts that failed during apply (e.g., .mcp.json in dev mode)
    const failedPaths = new Set(applyResult.failed.map((f) => f.item.path));
    const reallyMissing = result.added.filter((a) => !failedPaths.has(a.path));
    expect(reallyMissing).toHaveLength(0);
  });

  it("throws on non-initialized project", () => {
    const dir = makeTempDir();
    expect(() => checkUpgrade(dir)).toThrow("not initialized");
  });
});

describe("applyUpgrade", () => {
  it("creates missing artifacts without overwriting existing ones", () => {
    const dir = makeTempDir();
    setupInitializedProject(dir);

    // Create one artifact manually with custom content
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "settings.json"), '{"custom": true}');

    const result = applyUpgrade(dir);

    // settings.json should NOT be overwritten
    expect(
      result.alreadyPresent.some((a) => a.path.includes("settings.json")),
    ).toBe(true);

    // .mcp.json: created in compiled binary, fails gracefully in dev mode
    const mcpCreated = existsSync(join(dir, ".mcp.json"));
    const mcpFailed = result.failed.some((f) => f.item.path === ".mcp.json");
    expect(mcpCreated || mcpFailed).toBe(true);

    // Verify custom settings.json was preserved
    const settings = JSON.parse(
      readFileSync(join(dir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.custom).toBe(true);
  });

  it("creates docs/context if missing", () => {
    const dir = makeTempDir();
    setupInitializedProject(dir);

    applyUpgrade(dir);

    expect(existsSync(join(dir, "docs", "context"))).toBe(true);
  });

  it("creates preflight hook as executable", () => {
    const dir = makeTempDir();
    setupInitializedProject(dir);

    applyUpgrade(dir);

    const hookPath = join(dir, ".claude", "hooks", "git-preflight.sh");
    expect(existsSync(hookPath)).toBe(true);
    const stat = statSync(hookPath);
    expect((stat.mode & 0o111) !== 0).toBe(true);
  });
});
