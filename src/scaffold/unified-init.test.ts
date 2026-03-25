import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { runUnifiedInit, type UnifiedInitDeps } from "./unified-init.js";

const makeTempDir = useTempDir("unified-init-test");

const noopDeps = (rootDir: string): UnifiedInitDeps => ({
  rootDir,
  runGreenfield: vi.fn().mockResolvedValue({
    turnCount: 5,
    documentsGenerated: ["vision", "prd"],
    config: { project: { name: "Test" } },
  }),
  applyMigration: vi
    .fn()
    .mockReturnValue({ added: [], alreadyPresent: [], failed: [] }),
  extractConfigFromDocs: vi.fn().mockResolvedValue({
    project: {
      name: "Test",
      owner: "Owner",
      language: "TypeScript",
      languages: ["TypeScript"],
      status: "active",
      repo: "",
    },
  }),
  saveConfig: vi.fn(),
  generateContext: vi.fn().mockReturnValue("# Context"),
  installProviderAdapter: vi.fn(),
  scaffoldDirectories: vi.fn(),
});

describe("runUnifiedInit", () => {
  describe("greenfield mode", () => {
    it("runs the interview when no config and no docs", async () => {
      const dir = makeTempDir();
      const deps = noopDeps(dir);
      const result = await runUnifiedInit(deps);

      expect(result.mode).toBe("greenfield");
      expect(deps.runGreenfield).toHaveBeenCalled();
      expect(deps.extractConfigFromDocs).not.toHaveBeenCalled();
    });
  });

  describe("existing mode", () => {
    it("skips interview when docs exist", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");

      const deps = noopDeps(dir);
      const result = await runUnifiedInit(deps);

      expect(result.mode).toBe("existing");
      expect(deps.runGreenfield).not.toHaveBeenCalled();
      expect(deps.extractConfigFromDocs).toHaveBeenCalled();
      expect(deps.saveConfig).toHaveBeenCalled();
    });

    it("reports missing docs as gaps", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");

      const deps = noopDeps(dir);
      const result = await runUnifiedInit(deps);

      expect(result.missingDocs).toContain("docs/VISION.md");
      expect(result.missingDocs).not.toContain("docs/PRD.md");
    });
  });

  describe("migration mode", () => {
    it("applies migration when .telesis/config.yml exists", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(
        join(dir, ".telesis", "config.yml"),
        "project:\n  name: Test\n",
      );

      const deps = noopDeps(dir);
      const result = await runUnifiedInit(deps);

      expect(result.mode).toBe("migration");
      expect(deps.applyMigration).toHaveBeenCalled();
      expect(deps.runGreenfield).not.toHaveBeenCalled();
      expect(deps.extractConfigFromDocs).not.toHaveBeenCalled();
    });
  });

  describe("provider adapter", () => {
    it("installs provider adapter in all modes", async () => {
      const dir = makeTempDir();
      const deps = noopDeps(dir);
      await runUnifiedInit(deps);
      expect(deps.installProviderAdapter).toHaveBeenCalled();
    });
  });

  describe("idempotency", () => {
    it("second run on initialized project is migration mode", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(
        join(dir, ".telesis", "config.yml"),
        "project:\n  name: Test\n",
      );

      const deps = noopDeps(dir);
      await runUnifiedInit(deps);
      await runUnifiedInit(deps);

      expect(deps.applyMigration).toHaveBeenCalledTimes(2);
    });
  });

  describe("custom docs directory", () => {
    it("searches custom path when docsDir provided", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "documentation"), { recursive: true });
      writeFileSync(join(dir, "documentation", "PRD.md"), "# PRD\n");

      const deps = { ...noopDeps(dir), docsDir: "documentation" };
      const result = await runUnifiedInit(deps);

      expect(result.mode).toBe("existing");
      expect(result.existingDocs).toContain("documentation/PRD.md");
    });
  });
});
