import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import { getStatus } from "./status.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-status-test-"));

const setupProject = (): string => {
  const rootDir = makeTempDir();
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test Owner",
      language: "Go",
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
  it("returns basic status", () => {
    const rootDir = setupProject();
    const s = getStatus(rootDir);

    expect(s.projectName).toBe("TestProject");
    expect(s.projectStatus).toBe("active");
    expect(s.adrCount).toBe(0);
    expect(s.tddCount).toBe(0);
    expect(s.contextGeneratedAt).toBeNull();
  });

  it("counts ADRs", () => {
    const rootDir = setupProject();
    const adrDir = join(rootDir, "docs", "adr");

    for (let i = 1; i <= 3; i++) {
      writeFileSync(
        join(adrDir, `ADR-${String(i).padStart(3, "0")}-test.md`),
        `# ADR-${String(i).padStart(3, "0")}: test\n`,
      );
    }
    writeFileSync(join(adrDir, "README.md"), "# ADRs\n");

    const s = getStatus(rootDir);
    expect(s.adrCount).toBe(3);
  });

  it("counts TDDs", () => {
    const rootDir = setupProject();
    const tddDir = join(rootDir, "docs", "tdd");

    for (let i = 1; i <= 2; i++) {
      writeFileSync(
        join(tddDir, `TDD-${String(i).padStart(3, "0")}-test.md`),
        `# TDD-${String(i).padStart(3, "0")}: test\n`,
      );
    }

    const s = getStatus(rootDir);
    expect(s.tddCount).toBe(2);
  });

  it("reads context timestamp", () => {
    const rootDir = setupProject();
    const claudePath = join(rootDir, "CLAUDE.md");
    writeFileSync(claudePath, "# Test\n");

    const knownTime = new Date("2026-01-15T10:30:00.000Z");
    utimesSync(claudePath, knownTime, knownTime);

    const s = getStatus(rootDir);
    expect(s.contextGeneratedAt).not.toBeNull();
    expect(s.contextGeneratedAt!.getTime()).toBe(knownTime.getTime());
  });

  it("extracts active (In Progress) milestone", () => {
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

    const s = getStatus(rootDir);
    expect(s.activeMilestone).toContain("v0.2.0");
    expect(s.activeMilestone).toContain("Second milestone");
    expect(s.activeMilestone).not.toContain("First milestone");
    expect(s.activeMilestone).not.toContain("More stuff here");
  });

  it("falls back to last completed milestone", () => {
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

    const s = getStatus(rootDir);
    expect(s.activeMilestone).toContain("Build the first version");
    expect(s.activeMilestone).not.toContain("Upcoming stuff");
  });

  it("returns empty when no status markers present", () => {
    const rootDir = setupProject();
    writeFileSync(
      join(rootDir, "docs", "MILESTONES.md"),
      `# Milestones

## Phase 1

No status marker here.
`,
    );

    const s = getStatus(rootDir);
    expect(s.activeMilestone).toBe("");
  });

  it("handles missing optional files", () => {
    const rootDir = setupProject();

    const s = getStatus(rootDir);
    expect(s.activeMilestone).toBe("");
    expect(s.contextGeneratedAt).toBeNull();
    expect(s.adrCount).toBe(0);
    expect(s.tddCount).toBe(0);
  });

  it("fails without config", () => {
    const rootDir = makeTempDir();
    expect(() => getStatus(rootDir)).toThrow("telesis init");
  });
});
