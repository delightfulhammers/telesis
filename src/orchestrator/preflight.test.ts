import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPreflight } from "./preflight.js";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("orchestrator-preflight-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test",
      language: "TypeScript",
      languages: ["TypeScript"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
};

describe("runPreflight", () => {
  it("reports milestone entry check", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const result = runPreflight(dir);

    const milestoneCheck = result.checks.find(
      (c) => c.name === "Milestone entry",
    );
    expect(milestoneCheck).toBeDefined();
    // No milestone → fails
    expect(milestoneCheck!.passed).toBe(false);
  });

  it("passes milestone check when milestone exists", () => {
    const dir = makeTempDir();
    setupProject(dir);
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      "# Milestones\n\n## v0.1.0 — Test\n\n**Status:** In Progress\n\n### Acceptance Criteria\n\n1. Something\n",
    );

    const result = runPreflight(dir);

    const milestoneCheck = result.checks.find(
      (c) => c.name === "Milestone entry",
    );
    expect(milestoneCheck!.passed).toBe(true);
  });

  it("reports no blocking decisions when none exist", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const result = runPreflight(dir);

    const decisionCheck = result.checks.find(
      (c) => c.name === "Pending decisions",
    );
    expect(decisionCheck).toBeDefined();
    expect(decisionCheck!.passed).toBe(true);
  });

  it("returns overall passed=false when any check fails", () => {
    const dir = makeTempDir();
    setupProject(dir);
    // No milestone → at least one check fails

    const result = runPreflight(dir);

    expect(result.passed).toBe(false);
  });
});
