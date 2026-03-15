import { describe, it, expect, vi } from "vitest";
import { finalizeMilestone } from "./finalize.js";
import type { FinalizeDeps, FinalizeOptions } from "./finalize.js";
import type { CompletionResult } from "./complete.js";

const makeResult = (
  overrides?: Partial<CompletionResult>,
): CompletionResult => ({
  milestone: "v0.9.0 — Milestone Validation",
  version: "0.9.0",
  steps: [],
  modifiedFiles: ["docs/MILESTONES.md", "package.json", "CLAUDE.md"],
  ...overrides,
});

const makeOptions = (
  overrides?: Partial<FinalizeOptions>,
): FinalizeOptions => ({
  tag: true,
  push: true,
  ...overrides,
});

const makeDeps = (overrides?: Partial<FinalizeDeps>): FinalizeDeps => ({
  stageFiles: vi.fn(),
  commit: vi.fn(() => ({
    sha: "abc1234def5678",
    branch: "main",
    message: "chore: complete milestone",
    filesChanged: 3,
  })),
  createTag: vi.fn(),
  push: vi.fn(() => ({ branch: "main", remote: "origin" })),
  pushTag: vi.fn(),
  currentBranch: vi.fn(() => "main"),
  fileHasChanges: vi.fn(() => false),
  tagExists: vi.fn(() => false),
  ...overrides,
});

describe("finalizeMilestone", () => {
  it("stages the correct files from completion result", () => {
    const deps = makeDeps();
    finalizeMilestone("/root", makeResult(), makeOptions(), deps);

    expect(deps.stageFiles).toHaveBeenCalledWith("/root", [
      "docs/MILESTONES.md",
      "package.json",
      "CLAUDE.md",
    ]);
  });

  it("commits with the correct message format", () => {
    const deps = makeDeps();
    finalizeMilestone("/root", makeResult(), makeOptions(), deps);

    expect(deps.commit).toHaveBeenCalledWith(
      "/root",
      "chore: complete milestone v0.9.0 — Milestone Validation (v0.9.0)",
    );
  });

  it("creates tag when tag option is true", () => {
    const deps = makeDeps();
    finalizeMilestone("/root", makeResult(), makeOptions({ tag: true }), deps);

    expect(deps.createTag).toHaveBeenCalledWith("/root", "v0.9.0");
  });

  it("skips tag when tag option is false", () => {
    const deps = makeDeps();
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ tag: false }),
      deps,
    );

    expect(deps.createTag).not.toHaveBeenCalled();
    const tagStep = result.steps.find((s) => s.name === "Create tag");
    expect(tagStep?.message).toContain("Skipped");
  });

  it("pushes branch and tag when push option is true", () => {
    const deps = makeDeps();
    finalizeMilestone("/root", makeResult(), makeOptions({ push: true }), deps);

    expect(deps.currentBranch).toHaveBeenCalledWith("/root");
    expect(deps.push).toHaveBeenCalledWith("/root", "main");
    expect(deps.pushTag).toHaveBeenCalledWith("/root", "v0.9.0");
  });

  it("skips push when push option is false", () => {
    const deps = makeDeps();
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ push: false }),
      deps,
    );

    expect(deps.push).not.toHaveBeenCalled();
    expect(deps.pushTag).not.toHaveBeenCalled();
    const pushBranchStep = result.steps.find((s) => s.name === "Push branch");
    const pushTagStep = result.steps.find((s) => s.name === "Push tag");
    expect(pushBranchStep?.message).toContain("Skipped");
    expect(pushTagStep?.message).toContain("Skipped");
  });

  it("does not push tag when push is true but tag is false", () => {
    const deps = makeDeps();
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ push: true, tag: false }),
      deps,
    );

    expect(deps.push).toHaveBeenCalled();
    expect(deps.pushTag).not.toHaveBeenCalled();
    const pushTagStep = result.steps.find((s) => s.name === "Push tag");
    expect(pushTagStep?.message).toContain("Skipped");
  });

  it("includes uncommitted PRD.md in staged files", () => {
    const deps = makeDeps({
      fileHasChanges: vi.fn((_, path) => path === "docs/PRD.md"),
    });
    finalizeMilestone("/root", makeResult(), makeOptions(), deps);

    expect(deps.stageFiles).toHaveBeenCalledWith("/root", [
      "docs/MILESTONES.md",
      "package.json",
      "CLAUDE.md",
      "docs/PRD.md",
    ]);
  });

  it("mentions included doc files in stage message", () => {
    const deps = makeDeps({
      fileHasChanges: vi.fn((_, path) => path === "docs/PRD.md"),
    });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    const stageStep = result.steps.find((s) => s.name === "Stage files");
    expect(stageStep?.message).toContain("docs/PRD.md");
  });

  it("includes uncommitted ARCHITECTURE.md in staged files", () => {
    const deps = makeDeps({
      fileHasChanges: vi.fn((_, path) => path === "docs/ARCHITECTURE.md"),
    });

    finalizeMilestone("/root", makeResult(), makeOptions(), deps);

    expect(deps.stageFiles).toHaveBeenCalledWith("/root", [
      "docs/MILESTONES.md",
      "package.json",
      "CLAUDE.md",
      "docs/ARCHITECTURE.md",
    ]);
  });

  it("includes both doc files when both have changes", () => {
    const deps = makeDeps({
      fileHasChanges: vi.fn(() => true),
    });

    finalizeMilestone("/root", makeResult(), makeOptions(), deps);

    expect(deps.stageFiles).toHaveBeenCalledWith("/root", [
      "docs/MILESTONES.md",
      "package.json",
      "CLAUDE.md",
      "docs/PRD.md",
      "docs/ARCHITECTURE.md",
    ]);
  });

  it("returns reminders for clean doc files", () => {
    const deps = makeDeps({ fileHasChanges: vi.fn(() => false) });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    expect(result.reminders).toHaveLength(2);
    expect(result.reminders[0]).toContain("docs/PRD.md");
    expect(result.reminders[1]).toContain("docs/ARCHITECTURE.md");
  });

  it("returns no reminders when both doc files have changes", () => {
    const deps = makeDeps({ fileHasChanges: vi.fn(() => true) });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    expect(result.reminders).toHaveLength(0);
  });

  it("includes TDD files from modifiedFiles in staged files", () => {
    const deps = makeDeps();
    finalizeMilestone(
      "/root",
      makeResult({
        modifiedFiles: [
          "docs/MILESTONES.md",
          "package.json",
          "CLAUDE.md",
          "docs/tdd/TDD-007-test.md",
        ],
      }),
      makeOptions(),
      deps,
    );

    expect(deps.stageFiles).toHaveBeenCalledWith("/root", [
      "docs/MILESTONES.md",
      "package.json",
      "CLAUDE.md",
      "docs/tdd/TDD-007-test.md",
    ]);
  });

  it("reports consistent step names when all options enabled", () => {
    const deps = makeDeps({ fileHasChanges: vi.fn(() => false) });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    expect(result.steps.map((s) => s.name)).toEqual([
      "Stage files",
      "Commit",
      "Create tag",
      "Push branch",
      "Push tag",
    ]);
    expect(result.steps.every((s) => s.passed)).toBe(true);
  });

  it("reports consistent step names when push is skipped", () => {
    const deps = makeDeps();
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ push: false }),
      deps,
    );

    expect(result.steps.map((s) => s.name)).toEqual([
      "Stage files",
      "Commit",
      "Create tag",
      "Push branch",
      "Push tag",
    ]);
  });

  it("reports consistent step names when tag is skipped", () => {
    const deps = makeDeps();
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ tag: false }),
      deps,
    );

    expect(result.steps.map((s) => s.name)).toEqual([
      "Stage files",
      "Commit",
      "Create tag",
      "Push branch",
      "Push tag",
    ]);
  });

  it("fails tag step when tag already exists instead of throwing", () => {
    const deps = makeDeps({ tagExists: vi.fn(() => true) });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ tag: true }),
      deps,
    );

    expect(deps.createTag).not.toHaveBeenCalled();
    const tagStep = result.steps.find((s) => s.name === "Create tag");
    expect(tagStep?.passed).toBe(false);
    expect(tagStep?.message).toContain("already exists");
  });

  it("does not push tag when tag already exists", () => {
    const deps = makeDeps({ tagExists: vi.fn(() => true) });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions({ tag: true, push: true }),
      deps,
    );

    expect(deps.pushTag).not.toHaveBeenCalled();
    const pushTagStep = result.steps.find((s) => s.name === "Push tag");
    expect(pushTagStep?.message).toContain("Skipped");
  });

  it("returns early with failed step when stageFiles throws", () => {
    const deps = makeDeps({
      stageFiles: vi.fn(() => {
        throw new Error("git add failed");
      }),
    });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.name).toBe("Stage files");
    expect(result.steps[0]!.passed).toBe(false);
    expect(result.steps[0]!.message).toContain("git add failed");
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it("returns early with failed step when commit throws", () => {
    const deps = makeDeps({
      commit: vi.fn(() => {
        throw new Error("nothing to commit");
      }),
    });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]!.name).toBe("Commit");
    expect(result.steps[1]!.passed).toBe(false);
    expect(deps.createTag).not.toHaveBeenCalled();
  });

  it("records failed step when push throws", () => {
    const deps = makeDeps({
      push: vi.fn(() => {
        throw new Error("remote rejected");
      }),
    });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    const pushStep = result.steps.find((s) => s.name === "Push branch");
    expect(pushStep?.passed).toBe(false);
    expect(pushStep?.message).toContain("remote rejected");
  });

  it("records failed step when createTag throws", () => {
    const deps = makeDeps({
      createTag: vi.fn(() => {
        throw new Error("tag error");
      }),
    });
    const result = finalizeMilestone(
      "/root",
      makeResult(),
      makeOptions(),
      deps,
    );

    const tagStep = result.steps.find((s) => s.name === "Create tag");
    expect(tagStep?.passed).toBe(false);
    expect(tagStep?.message).toContain("tag error");
  });
});
