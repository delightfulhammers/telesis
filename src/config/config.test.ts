import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { save, load, exists } from "./config.js";
import type { Config } from "./config.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-config-test-"));

describe("config", () => {
  describe("save and load", () => {
    it("round-trips config through save and load", () => {
      const rootDir = makeTempDir();
      const cfg: Config = {
        project: {
          name: "TestProject",
          owner: "Test Owner",
          language: "Go",
          status: "active",
          repo: "github.com/test/project",
        },
      };

      save(rootDir, cfg);

      const configPath = join(rootDir, ".telesis", "config.yml");
      expect(existsSync(configPath)).toBe(true);

      const loaded = load(rootDir);
      expect(loaded.project.name).toBe(cfg.project.name);
      expect(loaded.project.owner).toBe(cfg.project.owner);
      expect(loaded.project.language).toBe(cfg.project.language);
      expect(loaded.project.status).toBe(cfg.project.status);
      expect(loaded.project.repo).toBe(cfg.project.repo);
    });
  });

  describe("load nonexistent", () => {
    it("throws when config does not exist", () => {
      const rootDir = makeTempDir();
      expect(() => load(rootDir)).toThrow();
    });
  });

  describe("load empty config returns error", () => {
    it("throws when config has no project name", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        "# Telesis project configuration\n",
      );

      expect(() => load(rootDir)).toThrow("project.name");
    });
  });

  describe("save creates directory", () => {
    it("creates .telesis directory if it does not exist", () => {
      const rootDir = makeTempDir();
      const cfg: Config = {
        project: { name: "TestProject", owner: "", language: "", status: "", repo: "" },
      };

      save(rootDir, cfg);

      const telesisDir = join(rootDir, ".telesis");
      const info = statSync(telesisDir);
      expect(info.isDirectory()).toBe(true);
    });
  });

  describe("exists", () => {
    it("returns false when no config", () => {
      const rootDir = makeTempDir();
      expect(exists(rootDir)).toBe(false);
    });

    it("returns true when config exists", () => {
      const rootDir = makeTempDir();
      save(rootDir, {
        project: { name: "Test", owner: "", language: "", status: "", repo: "" },
      });
      expect(exists(rootDir)).toBe(true);
    });
  });
});
