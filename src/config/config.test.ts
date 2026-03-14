import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  save,
  load,
  exists,
  loadRawConfig,
  parseDaemonConfig,
  parseDispatchConfig,
  parseOversightConfig,
  parseIntakeConfig,
  parsePlannerConfig,
  parseValidationConfig,
  parseGitConfig,
  parsePipelineConfig,
} from "./config.js";
import type { Config } from "./config.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("config-test");
const writeConfig = (rootDir: string, lines: readonly string[]): void => {
  const dir = join(rootDir, ".telesis");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.yml"), lines.join("\n"));
};

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

  describe("loadRawConfig", () => {
    it("returns null when config file is missing", () => {
      const rootDir = makeTempDir();
      expect(loadRawConfig(rootDir)).toBeNull();
    });

    it("returns parsed object when config file exists", () => {
      const rootDir = makeTempDir();
      writeConfig(rootDir, [
        "project:",
        "  name: Test",
        "git:",
        "  commitToMain: true",
      ]);

      expect(loadRawConfig(rootDir)).toEqual({
        project: { name: "Test" },
        git: { commitToMain: true },
      });
    });

    it("uses process.cwd() when rootDir is omitted", () => {
      const rootDir = makeTempDir();
      writeConfig(rootDir, ["project:", "  name: CwdTest"]);
      const prev = process.cwd();
      process.chdir(rootDir);
      try {
        expect(loadRawConfig()).toEqual({ project: { name: "CwdTest" } });
      } finally {
        process.chdir(prev);
      }
    });
  });

  describe("parse*Config with null raw config", () => {
    it("returns defaults for all parse functions", () => {
      expect(parseDispatchConfig(null)).toEqual({});
      expect(parseOversightConfig(null)).toEqual({});
      expect(parseIntakeConfig(null)).toEqual({});
      expect(parseDaemonConfig(null)).toEqual({});
      expect(parseValidationConfig(null)).toEqual({});
      expect(parsePlannerConfig(null)).toEqual({});
      expect(parseGitConfig(null)).toEqual({});
      expect(parsePipelineConfig(null)).toEqual({
        reviewBeforePush: false,
        reviewBlockThreshold: "high",
      });
    });
  });

  describe("parse*Config with populated raw config", () => {
    it("picks values from each section", () => {
      const raw = {
        dispatch: {
          defaultAgent: "codex",
          maxConcurrent: 3,
          acpxPath: "/tmp/acpx",
        },
        oversight: {
          enabled: true,
          defaultModel: "claude-sonnet-4-6",
        },
        intake: {
          github: {
            labels: ["telesis", "ready"],
            excludeLabels: ["wontfix"],
            assignee: "alice",
            state: "open",
          },
        },
        daemon: {
          heartbeatIntervalMs: 2500,
          watch: {
            ignore: ["node_modules", ".git"],
          },
        },
        validation: {
          model: "claude-sonnet-4-6",
          maxRetries: 2,
          enableGates: true,
        },
        planner: {
          model: "claude-sonnet-4-6",
          maxTasks: 12,
        },
        git: {
          branchPrefix: "feature/",
          commitToMain: true,
          pushAfterCommit: false,
          createPR: true,
        },
        pipeline: {
          autoApprove: true,
          closeIssue: false,
          reviewBeforePush: true,
          reviewBlockThreshold: "medium",
        },
      };

      expect(parseDispatchConfig(raw)).toEqual({
        defaultAgent: "codex",
        maxConcurrent: 3,
        acpxPath: "/tmp/acpx",
      });
      expect(parseOversightConfig(raw)).toEqual({
        enabled: true,
        defaultModel: "claude-sonnet-4-6",
      });
      expect(parseIntakeConfig(raw)).toEqual({
        github: {
          labels: ["telesis", "ready"],
          excludeLabels: ["wontfix"],
          assignee: "alice",
          state: "open",
        },
      });
      expect(parseDaemonConfig(raw)).toEqual({
        heartbeatIntervalMs: 2500,
        watch: { ignore: ["node_modules", ".git"] },
      });
      expect(parseValidationConfig(raw)).toEqual({
        model: "claude-sonnet-4-6",
        maxRetries: 2,
        enableGates: true,
      });
      expect(parsePlannerConfig(raw)).toEqual({
        model: "claude-sonnet-4-6",
        maxTasks: 12,
      });
      expect(parseGitConfig(raw)).toEqual({
        branchPrefix: "feature/",
        commitToMain: true,
        pushAfterCommit: false,
        createPR: true,
      });
      expect(parsePipelineConfig(raw)).toEqual({
        autoApprove: true,
        closeIssue: false,
        reviewBeforePush: true,
        reviewBlockThreshold: "medium",
      });
    });
  });

  describe("single logical config load", () => {
    it("loads once and parses multiple sections from the same raw object", () => {
      const rootDir = makeTempDir();
      writeConfig(rootDir, [
        "project:",
        "  name: Test",
        "dispatch:",
        "  defaultAgent: codex",
        "git:",
        "  branchPrefix: feature/",
        "pipeline:",
        "  autoApprove: true",
      ]);

      const raw = loadRawConfig(rootDir);
      expect(parseDispatchConfig(raw)).toEqual({ defaultAgent: "codex" });
      expect(parseGitConfig(raw)).toEqual({ branchPrefix: "feature/" });
      expect(parsePipelineConfig(raw)).toEqual({
        autoApprove: true,
        reviewBeforePush: false,
        reviewBlockThreshold: "high",
      });
    });
  });

  describe("parsePipelineConfig", () => {
    it("returns defaults when neither review field is present", () => {
      const raw = { pipeline: { autoApprove: true } };
      const result = parsePipelineConfig(raw);
      expect(result.autoApprove).toBe(true);
      expect(result.reviewBeforePush).toBe(false);
      expect(result.reviewBlockThreshold).toBe("high");
    });

    it("parses both review fields when present", () => {
      const raw = {
        pipeline: {
          reviewBeforePush: true,
          reviewBlockThreshold: "critical",
        },
      };
      expect(parsePipelineConfig(raw)).toEqual({
        reviewBeforePush: true,
        reviewBlockThreshold: "critical",
      });
    });

    it("accepts all valid threshold values", () => {
      for (const threshold of ["critical", "high", "medium", "low"]) {
        const raw = { pipeline: { reviewBlockThreshold: threshold } };
        expect(parsePipelineConfig(raw)).toEqual({
          reviewBeforePush: false,
          reviewBlockThreshold: threshold,
        });
      }
    });

    it("throws TypeError for invalid reviewBlockThreshold", () => {
      const raw = { pipeline: { reviewBlockThreshold: "severe" } };
      expect(() => parsePipelineConfig(raw)).toThrow(TypeError);
      expect(() => parsePipelineConfig(raw)).toThrow(
        /Invalid reviewBlockThreshold.*severe/,
      );
    });

    it("throws TypeError for non-string reviewBlockThreshold", () => {
      const raw = { pipeline: { reviewBlockThreshold: 42 } };
      expect(() => parsePipelineConfig(raw)).toThrow(TypeError);
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
