import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  parseGitHubConfig,
  resolveGitHubApiBase,
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
          languages: ["Go"],
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
      expect(loaded.project.language).toBe("Go");
      expect(loaded.project.languages).toEqual(["Go"]);
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
          languages: [],
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
          languages: [],
          status: "",
          repo: "",
        },
      };
      save(rootDir, cfg);
      const loaded = load(rootDir);
      expect(loaded.review).toBeUndefined();
    });
  });

  describe("languages array", () => {
    it("loads languages array correctly", () => {
      const rootDir = makeTempDir();
      writeConfig(rootDir, [
        "project:",
        "  name: Test",
        "  languages:",
        "    - Go",
        "    - Python",
      ]);

      const loaded = load(rootDir);
      expect(loaded.project.languages).toEqual(["Go", "Python"]);
      expect(loaded.project.language).toBe("Go");
    });

    it("handles missing languages as empty array", () => {
      const rootDir = makeTempDir();
      writeConfig(rootDir, ["project:", "  name: Test"]);

      const loaded = load(rootDir);
      expect(loaded.project.languages).toEqual([]);
      expect(loaded.project.language).toBe("");
    });

    it("filters non-string values from languages array", () => {
      const rootDir = makeTempDir();
      writeConfig(rootDir, [
        "project:",
        "  name: Test",
        "  languages:",
        "    - Go",
        "    - 42",
        "    - true",
        "    - Python",
      ]);

      const loaded = load(rootDir);
      expect(loaded.project.languages).toEqual(["Go", "Python"]);
    });

    it("save writes languages array and round-trips", () => {
      const rootDir = makeTempDir();
      const cfg: Config = {
        project: {
          name: "Test",
          owner: "Owner",
          language: "Go",
          languages: ["Go", "Python"],
          status: "active",
          repo: "",
        },
      };

      save(rootDir, cfg);
      const loaded = load(rootDir);
      expect(loaded.project.languages).toEqual(["Go", "Python"]);
      expect(loaded.project.language).toBe("Go");
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
      expect(parseGitHubConfig(null)).toEqual({});
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
          sessionLifecycle: {
            restartPolicy: "auto-restart",
            cooldownSeconds: 60,
            maxRestartsPerMilestone: 5,
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
        sessionLifecycle: {
          restartPolicy: "auto-restart",
          cooldownSeconds: 60,
          maxRestartsPerMilestone: 5,
        },
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

    it("parses reviewModel when present", () => {
      const raw = { pipeline: { reviewModel: "claude-opus-4-6" } };
      const result = parsePipelineConfig(raw);
      expect(result.reviewModel).toBe("claude-opus-4-6");
    });

    it("omits reviewModel when absent", () => {
      const raw = { pipeline: { autoApprove: true } };
      const result = parsePipelineConfig(raw);
      expect(result.reviewModel).toBeUndefined();
    });

    it("ignores empty string reviewModel", () => {
      const raw = { pipeline: { reviewModel: "" } };
      const result = parsePipelineConfig(raw);
      expect(result.reviewModel).toBeUndefined();
    });

    it("parses qualityGates with all gates", () => {
      const raw = {
        pipeline: {
          qualityGates: {
            format: "pnpm run format",
            lint: "pnpm run lint",
            test: "pnpm test",
            build: "pnpm run build",
            drift: true,
          },
        },
      };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toEqual({
        format: "pnpm run format",
        lint: "pnpm run lint",
        test: "pnpm test",
        build: "pnpm run build",
        drift: true,
      });
    });

    it("parses qualityGates with partial gates", () => {
      const raw = {
        pipeline: {
          qualityGates: {
            lint: "pnpm run lint",
            drift: true,
          },
        },
      };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toEqual({
        lint: "pnpm run lint",
        drift: true,
      });
    });

    it("omits qualityGates when absent", () => {
      const raw = { pipeline: { autoApprove: true } };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toBeUndefined();
    });

    it("handles null gate values (explicitly disabled)", () => {
      const raw = {
        pipeline: {
          qualityGates: {
            format: "pnpm run format",
            lint: null,
          },
        },
      };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toEqual({
        format: "pnpm run format",
        lint: null,
      });
    });

    it("omits qualityGates when empty object", () => {
      const raw = { pipeline: { qualityGates: {} } };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toBeUndefined();
    });

    it("ignores invalid qualityGates types", () => {
      const raw = { pipeline: { qualityGates: "invalid" } };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toBeUndefined();
    });

    it("ignores qualityGates array", () => {
      const raw = { pipeline: { qualityGates: ["lint", "test"] } };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toBeUndefined();
    });

    it("skips drift when false", () => {
      const raw = {
        pipeline: {
          qualityGates: {
            lint: "pnpm run lint",
            drift: false,
          },
        },
      };
      const result = parsePipelineConfig(raw);
      expect(result.qualityGates).toEqual({
        lint: "pnpm run lint",
        drift: false,
      });
    });
  });

  describe("parseGitHubConfig", () => {
    it("parses apiUrl when present", () => {
      const raw = { github: { apiUrl: "https://ghe.company.com/api/v3" } };
      expect(parseGitHubConfig(raw)).toEqual({
        apiUrl: "https://ghe.company.com/api/v3",
      });
    });

    it("returns empty when github section absent", () => {
      expect(parseGitHubConfig({})).toEqual({});
    });

    it("returns empty when github is not an object", () => {
      expect(parseGitHubConfig({ github: "invalid" })).toEqual({});
    });

    it("ignores empty apiUrl", () => {
      expect(parseGitHubConfig({ github: { apiUrl: "" } })).toEqual({});
    });

    it("ignores non-string apiUrl", () => {
      expect(parseGitHubConfig({ github: { apiUrl: 42 } })).toEqual({});
    });
  });

  describe("resolveGitHubApiBase", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.GITHUB_API_URL;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns default when no config or env", () => {
      expect(resolveGitHubApiBase(null)).toBe("https://api.github.com");
    });

    it("uses config apiUrl when set", () => {
      const raw = { github: { apiUrl: "https://ghe.company.com/api/v3" } };
      expect(resolveGitHubApiBase(raw)).toBe("https://ghe.company.com/api/v3");
    });

    it("strips trailing slashes from config", () => {
      const raw = { github: { apiUrl: "https://ghe.company.com/api/v3///" } };
      expect(resolveGitHubApiBase(raw)).toBe("https://ghe.company.com/api/v3");
    });

    it("env GITHUB_API_URL takes precedence over config", () => {
      process.env.GITHUB_API_URL = "https://env-ghe.example.com/api/v3";
      const raw = {
        github: { apiUrl: "https://config-ghe.example.com/api/v3" },
      };
      expect(resolveGitHubApiBase(raw)).toBe(
        "https://env-ghe.example.com/api/v3",
      );
    });

    it("strips trailing slashes from env", () => {
      process.env.GITHUB_API_URL = "https://ghe.example.com/api/v3/";
      expect(resolveGitHubApiBase(null)).toBe("https://ghe.example.com/api/v3");
    });

    it("ignores non-HTTPS env value and falls back to default", () => {
      process.env.GITHUB_API_URL = "http://attacker.com";
      expect(resolveGitHubApiBase(null)).toBe("https://api.github.com");
    });

    it("ignores non-HTTPS config value and falls back to default", () => {
      const raw = { github: { apiUrl: "http://attacker.com" } };
      expect(resolveGitHubApiBase(raw)).toBe("https://api.github.com");
    });
  });

  describe("parseIntakeConfig with jira", () => {
    it("parses full jira config", () => {
      const raw = {
        intake: {
          jira: {
            baseUrl: "https://company.atlassian.net",
            project: "PROJ",
            jql: "project = PROJ AND sprint in openSprints()",
            labels: ["ready-for-dev"],
            assignee: "john.smith",
            status: ["To Do", "Ready"],
            issueTypes: ["Bug", "Story"],
          },
        },
      };
      expect(parseIntakeConfig(raw)).toEqual({
        jira: {
          baseUrl: "https://company.atlassian.net",
          project: "PROJ",
          jql: "project = PROJ AND sprint in openSprints()",
          labels: ["ready-for-dev"],
          assignee: "john.smith",
          status: ["To Do", "Ready"],
          issueTypes: ["Bug", "Story"],
        },
      });
    });

    it("parses minimal jira config (baseUrl only)", () => {
      const raw = {
        intake: {
          jira: { baseUrl: "https://company.atlassian.net" },
        },
      };
      expect(parseIntakeConfig(raw)).toEqual({
        jira: { baseUrl: "https://company.atlassian.net" },
      });
    });

    it("skips jira when baseUrl is missing", () => {
      const raw = { intake: { jira: { project: "PROJ" } } };
      expect(parseIntakeConfig(raw)).toEqual({});
    });

    it("skips jira when baseUrl is empty string", () => {
      const raw = { intake: { jira: { baseUrl: "" } } };
      expect(parseIntakeConfig(raw)).toEqual({});
    });

    it("parses both github and jira together", () => {
      const raw = {
        intake: {
          github: { labels: ["bug"], state: "open" },
          jira: { baseUrl: "https://company.atlassian.net", project: "PROJ" },
        },
      };
      const result = parseIntakeConfig(raw);
      expect(result.github).toEqual({ labels: ["bug"], state: "open" });
      expect(result.jira).toEqual({
        baseUrl: "https://company.atlassian.net",
        project: "PROJ",
      });
    });

    it("filters non-string values from jira arrays", () => {
      const raw = {
        intake: {
          jira: {
            baseUrl: "https://company.atlassian.net",
            labels: ["valid", 42, "", "also-valid"],
            status: [true, "To Do"],
          },
        },
      };
      const result = parseIntakeConfig(raw);
      expect(result.jira?.labels).toEqual(["valid", "also-valid"]);
      expect(result.jira?.status).toEqual(["To Do"]);
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
          languages: [],
          status: "",
          repo: "",
        },
      });
      expect(exists(rootDir)).toBe(true);
    });
  });
});
