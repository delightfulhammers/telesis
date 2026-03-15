import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { completeMilestoneFromInfo } from "./complete.js";
import type { MilestoneInfo } from "./parse.js";

vi.mock("../context/context.js", () => ({
  generate: vi.fn(() => "# Generated CLAUDE.md"),
}));

const makeTempDir = useTempDir("milestones-complete");

const makeInfo = (overrides?: Partial<MilestoneInfo>): MilestoneInfo => ({
  name: "v0.9.0 — Milestone Validation",
  version: "0.9.0",
  status: "In Progress",
  tddReferences: [],
  criteria: [],
  raw: "",
  ...overrides,
});

const setupProject = (
  dir: string,
  opts?: {
    milestonesContent?: string;
    packageVersion?: string;
    tdds?: number[];
  },
) => {
  mkdirSync(join(dir, "docs", "tdd"), { recursive: true });
  mkdirSync(join(dir, ".telesis"), { recursive: true });

  writeFileSync(
    join(dir, "docs", "MILESTONES.md"),
    opts?.milestonesContent ??
      [
        "## v0.9.0 — Milestone Validation",
        "**Status:** In Progress",
        "",
        "### Acceptance Criteria",
        "1. Check works",
        "---",
      ].join("\n"),
  );

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "test", version: opts?.packageVersion ?? "0.8.1" }),
  );

  writeFileSync(
    join(dir, ".telesis", "config.yml"),
    "project:\n  name: test\n  owner: test\n  languages:\n  - TypeScript\n  status: active\n  repo: test\n",
  );

  for (const num of opts?.tdds ?? []) {
    const padded = String(num).padStart(3, "0");
    writeFileSync(
      join(dir, "docs", "tdd", `TDD-${padded}-test.md`),
      `# TDD-${padded}\n\n**Status:** Draft\n`,
    );
  }
};

describe("completeMilestoneFromInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates MILESTONES.md status to Complete", () => {
    const dir = makeTempDir();
    setupProject(dir);

    completeMilestoneFromInfo(makeInfo(), dir);

    const content = readFileSync(join(dir, "docs", "MILESTONES.md"), "utf-8");
    expect(content).toContain("**Status:** Complete");
    expect(content).not.toContain("In Progress");
  });

  it("bumps package.json version", () => {
    const dir = makeTempDir();
    setupProject(dir);

    completeMilestoneFromInfo(makeInfo(), dir);

    const pkg = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf-8"),
    ) as { version: string };
    expect(pkg.version).toBe("0.9.0");
  });

  it("updates TDD status to Accepted", () => {
    const dir = makeTempDir();
    setupProject(dir, { tdds: [7] });

    completeMilestoneFromInfo(makeInfo({ tddReferences: [7] }), dir);

    const content = readFileSync(
      join(dir, "docs", "tdd", "TDD-007-test.md"),
      "utf-8",
    );
    expect(content).toContain("**Status:** Accepted");
  });

  it("regenerates CLAUDE.md", () => {
    const dir = makeTempDir();
    setupProject(dir);

    completeMilestoneFromInfo(makeInfo(), dir);

    const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Generated CLAUDE.md");
  });

  it("errors if milestone is not In Progress", () => {
    const dir = makeTempDir();
    setupProject(dir);

    expect(() =>
      completeMilestoneFromInfo(makeInfo({ status: "Complete" }), dir),
    ).toThrow('expected "In Progress"');
  });

  it("errors if milestone status is Not Started", () => {
    const dir = makeTempDir();
    setupProject(dir);

    expect(() =>
      completeMilestoneFromInfo(makeInfo({ status: "Not Started" }), dir),
    ).toThrow('expected "In Progress"');
  });

  it("reports all steps in result", () => {
    const dir = makeTempDir();
    setupProject(dir, { tdds: [7] });

    const result = completeMilestoneFromInfo(
      makeInfo({ tddReferences: [7] }),
      dir,
    );

    expect(result.milestone).toBe("v0.9.0 — Milestone Validation");
    expect(result.version).toBe("0.9.0");
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.name)).toEqual([
      "Update MILESTONES.md",
      "Bump package.json",
      "Update TDD status",
      "Regenerate CLAUDE.md",
    ]);
  });

  it("handles already-correct package version", () => {
    const dir = makeTempDir();
    setupProject(dir, { packageVersion: "0.9.0" });

    const result = completeMilestoneFromInfo(makeInfo(), dir);

    const bumpStep = result.steps.find((s) => s.name === "Bump package.json");
    expect(bumpStep!.passed).toBe(true);
    expect(bumpStep!.message).toContain("Already at");
  });

  it("handles no TDD references gracefully", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const result = completeMilestoneFromInfo(
      makeInfo({ tddReferences: [] }),
      dir,
    );

    const tddStep = result.steps.find((s) => s.name === "Update TDD status");
    expect(tddStep!.passed).toBe(true);
    expect(tddStep!.message).toContain("No TDD references");
  });

  it("handles multi-word TDD status like In Progress", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs", "tdd"), { recursive: true });
    mkdirSync(join(dir, ".telesis"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      ["## v0.9.0 — Test", "**Status:** In Progress", "---"].join("\n"),
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", version: "0.8.1" }),
    );
    writeFileSync(
      join(dir, ".telesis", "config.yml"),
      "project:\n  name: test\n  owner: test\n  languages:\n  - TypeScript\n  status: active\n  repo: test\n",
    );
    writeFileSync(
      join(dir, "docs", "tdd", "TDD-007-test.md"),
      "# TDD-007\n\n**Status:** In Progress\n",
    );

    completeMilestoneFromInfo(makeInfo({ tddReferences: [7] }), dir);

    const content = readFileSync(
      join(dir, "docs", "tdd", "TDD-007-test.md"),
      "utf-8",
    );
    expect(content).toContain("**Status:** Accepted");
    expect(content).not.toContain("In Progress");
    expect(content).not.toContain("Progress");
  });
});
