import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import { getStatus } from "./status.js";
import { appendNote } from "../notes/store.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("status-test");

const setupProject = (): string => {
  const rootDir = makeTempDir();
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test Owner",
      language: "Go",
      languages: ["Go"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  return rootDir;
};

describe("status", () => {
  it("returns basic status", async () => {
    const rootDir = setupProject();
    const s = await getStatus(rootDir);

    expect(s.projectName).toBe("TestProject");
    expect(s.projectStatus).toBe("active");
    expect(s.adrCount).toBe(0);
    expect(s.tddCount).toBe(0);
    expect(s.contextGeneratedAt).toBeNull();
  });

  it("counts ADRs", async () => {
    const rootDir = setupProject();
    const adrDir = join(rootDir, "docs", "adr");

    for (let i = 1; i <= 3; i++) {
      writeFileSync(
        join(adrDir, `ADR-${String(i).padStart(3, "0")}-test.md`),
        `# ADR-${String(i).padStart(3, "0")}: test\n`,
      );
    }
    writeFileSync(join(adrDir, "README.md"), "# ADRs\n");

    const s = await getStatus(rootDir);
    expect(s.adrCount).toBe(3);
  });

  it("counts TDDs", async () => {
    const rootDir = setupProject();
    const tddDir = join(rootDir, "docs", "tdd");

    for (let i = 1; i <= 2; i++) {
      writeFileSync(
        join(tddDir, `TDD-${String(i).padStart(3, "0")}-test.md`),
        `# TDD-${String(i).padStart(3, "0")}: test\n`,
      );
    }

    const s = await getStatus(rootDir);
    expect(s.tddCount).toBe(2);
  });

  it("reads context timestamp", async () => {
    const rootDir = setupProject();
    const claudePath = join(rootDir, "CLAUDE.md");
    writeFileSync(claudePath, "# Test\n");

    const knownTime = new Date("2026-01-15T10:30:00.000Z");
    utimesSync(claudePath, knownTime, knownTime);

    const s = await getStatus(rootDir);
    expect(s.contextGeneratedAt).not.toBeNull();
    expect(s.contextGeneratedAt!.getTime()).toBe(knownTime.getTime());
  });

  it("extracts active (In Progress) milestone", async () => {
    const rootDir = setupProject();
    writeFileSync(
      join(rootDir, "docs", "MILESTONES.md"),
      `# Milestones

---

## MVP v0.1.0

**Goal:** First milestone.

**Status:** Complete

---

## v0.2.0 — AI-Powered Init

**Goal:** Second milestone.

**Status:** In Progress

### Acceptance Criteria

1. New thing one

---

## Future Milestones

More stuff here.
`,
    );

    const s = await getStatus(rootDir);
    expect(s.activeMilestone).toContain("v0.2.0");
    expect(s.activeMilestone).toContain("Second milestone");
    expect(s.activeMilestone).not.toContain("First milestone");
    expect(s.activeMilestone).not.toContain("More stuff here");
  });

  it("falls back to last completed milestone", async () => {
    const rootDir = setupProject();
    writeFileSync(
      join(rootDir, "docs", "MILESTONES.md"),
      `# Milestones

---

## MVP v0.1.0

**Goal:** Build the first version.

**Status:** Complete

---

## Future Milestones

Upcoming stuff.
`,
    );

    const s = await getStatus(rootDir);
    expect(s.activeMilestone).toContain("Build the first version");
    expect(s.activeMilestone).not.toContain("Upcoming stuff");
  });

  it("returns empty when no status markers present", async () => {
    const rootDir = setupProject();
    writeFileSync(
      join(rootDir, "docs", "MILESTONES.md"),
      `# Milestones

## Phase 1

No status marker here.
`,
    );

    const s = await getStatus(rootDir);
    expect(s.activeMilestone).toBe("");
  });

  it("handles missing optional files", async () => {
    const rootDir = setupProject();

    const s = await getStatus(rootDir);
    expect(s.activeMilestone).toBe("");
    expect(s.contextGeneratedAt).toBeNull();
    expect(s.adrCount).toBe(0);
    expect(s.tddCount).toBe(0);
  });

  it("counts notes", async () => {
    const rootDir = setupProject();

    appendNote(rootDir, "first note", ["git"]);
    appendNote(rootDir, "second note", []);

    const s = await getStatus(rootDir);
    expect(s.noteCount).toBe(2);
  });

  it("reports zero note count when no notes exist", async () => {
    const rootDir = setupProject();

    const s = await getStatus(rootDir);
    expect(s.noteCount).toBe(0);
  });

  it("fails without config", async () => {
    const rootDir = makeTempDir();
    await expect(getStatus(rootDir)).rejects.toThrow("telesis init");
  });

  it("reports zero tokens when no telemetry exists", async () => {
    const rootDir = setupProject();

    const s = await getStatus(rootDir);
    expect(s.totalInputTokens).toBe(0);
    expect(s.totalOutputTokens).toBe(0);
    expect(s.modelCallCount).toBe(0);
    expect(s.estimatedCost).toBeNull();
  });

  it("aggregates token counts from telemetry", async () => {
    const rootDir = setupProject();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const records = [
      {
        id: "1",
        timestamp: "2026-03-09T10:00:00Z",
        component: "interview",
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        inputTokens: 1000,
        outputTokens: 500,
        durationMs: 1500,
        sessionId: "s1",
      },
      {
        id: "2",
        timestamp: "2026-03-09T10:01:00Z",
        component: "generate",
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        inputTokens: 2000,
        outputTokens: 1000,
        durationMs: 2500,
        sessionId: "s1",
      },
    ];
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );

    const s = await getStatus(rootDir);
    expect(s.totalInputTokens).toBe(3000);
    expect(s.totalOutputTokens).toBe(1500);
    expect(s.modelCallCount).toBe(2);
  });

  it("computes estimated cost when pricing is available", async () => {
    const rootDir = setupProject();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    // Write a telemetry record
    const record = {
      id: "1",
      timestamp: "2026-03-09T10:00:00Z",
      component: "interview",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      durationMs: 5000,
      sessionId: "s1",
    };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    // Write pricing config
    const pricingYml = [
      "lastUpdated: '2026-03-09'",
      "models:",
      "  anthropic:",
      "    claude-sonnet-4-6:",
      "      inputPer1MTokens: 3.0",
      "      outputPer1MTokens: 15.0",
    ].join("\n");
    writeFileSync(join(rootDir, ".telesis", "pricing.yml"), pricingYml);

    const s = await getStatus(rootDir);
    // 1M input * $3/M + 100K output * $15/M = $3 + $1.50 = $4.50
    expect(s.estimatedCost).toBeCloseTo(4.5, 2);
  });

  it("returns null cost when pricing is unavailable", async () => {
    const rootDir = setupProject();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const record = {
      id: "1",
      timestamp: "2026-03-09T10:00:00Z",
      component: "interview",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 1000,
      outputTokens: 500,
      durationMs: 1500,
      sessionId: "s1",
    };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const s = await getStatus(rootDir);
    expect(s.totalInputTokens).toBe(1000);
    expect(s.estimatedCost).toBeNull();
  });
});
