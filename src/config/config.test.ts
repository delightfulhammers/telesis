import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  save,
  load,
  exists,
  parseIntakeConfig,
  parseGitConfig,
  parsePipelineConfig,
} from "./config.js";
import type { Config } from "./config.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("config-test");

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

  describe("load invalid config", () => {
    it("throws when config has no project name", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        "# Telesis project configuration\n",
      );

      expect(() => load(rootDir)).toThrow();
    });

    it("throws when config is a YAML list", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "config.yml"), "- item1\n- item2\n");

      expect(() => load(rootDir)).toThrow("mapping");
    });
  });

  describe("save creates directory", () => {
    it("creates .telesis directory if it does not exist", () => {
      const rootDir = makeTempDir();
      const cfg: Config = {
        project: {
          name: "TestProject",
          owner: "",
          language: "",
          status: "",
          repo: "",
        },
      };

      save(rootDir, cfg);

      const telesisDir = join(rootDir, ".telesis");
      const info = statSync(telesisDir);
      expect(info.isDirectory()).toBe(true);
    });
  });

  describe("review config", () => {
    it("loads review config with model override", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "review:",
          "  model: claude-opus-4-6",
        ].join("\n"),
      );

      const cfg = load(rootDir);
      expect(cfg.review?.model).toBe("claude-opus-4-6");
    });

    it("loads review config with persona model overrides", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "review:",
          "  personas:",
          "    - slug: security",
          "      model: claude-opus-4-6",
        ].join("\n"),
      );

      const cfg = load(rootDir);
      expect(cfg.review?.personas).toHaveLength(1);
      expect(cfg.review!.personas![0].slug).toBe("security");
      expect(cfg.review!.personas![0].model).toBe("claude-opus-4-6");
    });

    it("defaults review to undefined when not present", () => {
      const rootDir = makeTempDir();
      const cfg: Config = {
        project: {
          name: "Test",
          owner: "",
          language: "",
          status: "",
          repo: "",
        },
      };
      save(rootDir, cfg);
      const loaded = load(rootDir);
      expect(loaded.review).toBeUndefined();
    });
  });

  describe("parseIntakeConfig", () => {
    it("returns empty object when config file is missing", () => {
      const rootDir = makeTempDir();
      expect(parseIntakeConfig(rootDir)).toEqual({});
    });

    it("returns empty object when no intake section", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        ["project:", "  name: Test"].join("\n"),
      );

      expect(parseIntakeConfig(rootDir)).toEqual({});
    });

    it("parses GitHub labels and assignee", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "intake:",
          "  github:",
          "    labels:",
          '      - "telesis"',
          '      - "ready"',
          "    assignee: alice",
          "    state: open",
        ].join("\n"),
      );

      const config = parseIntakeConfig(rootDir);
      expect(config.github?.labels).toEqual(["telesis", "ready"]);
      expect(config.github?.assignee).toBe("alice");
      expect(config.github?.state).toBe("open");
    });

    it("parses excludeLabels", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "intake:",
          "  github:",
          "    excludeLabels:",
          '      - "wontfix"',
        ].join("\n"),
      );

      const config = parseIntakeConfig(rootDir);
      expect(config.github?.excludeLabels).toEqual(["wontfix"]);
    });

    it("ignores invalid field types while preserving valid ones", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "intake:",
          "  github:",
          "    labels: not-an-array",
          "    assignee: alice",
        ].join("\n"),
      );

      const config = parseIntakeConfig(rootDir);
      // labels is invalid (not an array) so it's dropped, but assignee is valid
      expect(config.github?.labels).toBeUndefined();
      expect(config.github?.assignee).toBe("alice");
    });

    it("returns empty github when all fields invalid", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "intake:",
          "  github:",
          "    labels: not-an-array",
        ].join("\n"),
      );

      const config = parseIntakeConfig(rootDir);
      expect(config.github).toBeUndefined();
    });
  });

  describe("parseGitConfig", () => {
    it("returns empty object when config file is missing", () => {
      const rootDir = makeTempDir();
      expect(parseGitConfig(rootDir)).toEqual({});
    });

    it("returns empty object when no git section", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        ["project:", "  name: Test"].join("\n"),
      );

      expect(parseGitConfig(rootDir)).toEqual({});
    });

    it("parses all git config fields", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "git:",
          '  branchPrefix: "feature/"',
          "  commitToMain: true",
          "  pushAfterCommit: false",
          "  createPR: true",
        ].join("\n"),
      );

      const config = parseGitConfig(rootDir);
      expect(config.branchPrefix).toBe("feature/");
      expect(config.commitToMain).toBe(true);
      expect(config.pushAfterCommit).toBe(false);
      expect(config.createPR).toBe(true);
    });

    it("ignores invalid field types", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "git:",
          "  branchPrefix: 42",
          "  commitToMain: true",
        ].join("\n"),
      );

      const config = parseGitConfig(rootDir);
      expect(config.branchPrefix).toBeUndefined();
      expect(config.commitToMain).toBe(true);
    });
  });

  describe("parsePipelineConfig", () => {
    it("returns empty object when config file is missing", () => {
      const rootDir = makeTempDir();
      expect(parsePipelineConfig(rootDir)).toEqual({});
    });

    it("returns empty object when no pipeline section", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        ["project:", "  name: Test"].join("\n"),
      );

      expect(parsePipelineConfig(rootDir)).toEqual({});
    });

    it("parses all pipeline config fields", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "pipeline:",
          "  autoApprove: true",
          "  closeIssue: true",
        ].join("\n"),
      );

      const config = parsePipelineConfig(rootDir);
      expect(config.autoApprove).toBe(true);
      expect(config.closeIssue).toBe(true);
    });

    it("ignores invalid field types", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "config.yml"),
        [
          "project:",
          "  name: Test",
          "pipeline:",
          '  autoApprove: "yes"',
          "  closeIssue: true",
        ].join("\n"),
      );

      const config = parsePipelineConfig(rootDir);
      expect(config.autoApprove).toBeUndefined();
      expect(config.closeIssue).toBe(true);
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
        project: {
          name: "Test",
          owner: "",
          language: "",
          status: "",
          repo: "",
        },
      });
      expect(exists(rootDir)).toBe(true);
    });
  });
});
