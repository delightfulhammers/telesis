import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPreflight } from "./preflight.js";
import { saveContext } from "./persistence.js";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import type { OrchestratorContext } from "./types.js";
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

const setOrchestratorState = (
  rootDir: string,
  state: OrchestratorContext["state"],
): void => {
  saveContext(rootDir, {
    state,
    workItemIds: [],
    updatedAt: new Date().toISOString(),
  });
};

describe("runPreflight", () => {
  it("passes when orchestrator is idle (housekeeping commits allowed)", () => {
    const dir = makeTempDir();
    setupProject(dir);
    setOrchestratorState(dir, "idle");

    const result = runPreflight(dir);

    // Only decision check runs when idle — should pass
    expect(result.passed).toBe(true);
    // Milestone check should NOT be present
    expect(
      result.checks.find((c) => c.name === "Milestone entry"),
    ).toBeUndefined();
  });

  it("passes when no orchestrator state exists", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const result = runPreflight(dir);

    expect(result.passed).toBe(true);
  });

  it("reports milestone entry check when orchestrator is active", () => {
    const dir = makeTempDir();
    setupProject(dir);
    setOrchestratorState(dir, "executing");

    const result = runPreflight(dir);

    const milestoneCheck = result.checks.find(
      (c) => c.name === "Milestone entry",
    );
    expect(milestoneCheck).toBeDefined();
    expect(milestoneCheck!.passed).toBe(false);
  });

  it("passes milestone check when milestone exists and orchestrator is active", () => {
    const dir = makeTempDir();
    setupProject(dir);
    setOrchestratorState(dir, "milestone_check");
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

  it("fails when orchestrator is active and review not converged", () => {
    const dir = makeTempDir();
    setupProject(dir);
    setOrchestratorState(dir, "executing");

    const result = runPreflight(dir);

    expect(result.passed).toBe(false);
    const reviewCheck = result.checks.find(
      (c) => c.name === "Review convergence",
    );
    expect(reviewCheck).toBeDefined();
    expect(reviewCheck!.passed).toBe(false);
  });
});
